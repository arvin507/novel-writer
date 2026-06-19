import { prisma } from "@/db/prisma";
import { stringifyJson } from "@/lib/utils";
import { runAgent } from "../orchestrator";
import {
  CharacterDesignerAgentPrompt,
  ChiefEditorAgentPrompt,
  EmotionEditorAgentPrompt,
  LogicCriticAgentPrompt,
  PlotArchitectAgentPrompt,
} from "../prompts";
import {
  characterDesignerSchema,
  chiefEditorSchema,
  criticSchema,
  plotArchitectSchema,
  type PlotArchitectOutput,
} from "../schemas";
import { compactErrorMessage, getProjectOrThrow, projectBrief, saveReviewReport } from "./helpers";

export async function generateOutline(projectId: string) {
  const workflowType = "generate_outline";
  const project = await getProjectOrThrow(projectId);
  const direction = await prisma.storyDirection.findFirst({
    where: { projectId, id: project.selectedDirectionId ?? undefined },
  });
  const hookPackage = await prisma.hookPackage.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const characterOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "CharacterDesignerAgent",
    systemPrompt: CharacterDesignerAgentPrompt,
    userPrompt: `请生成服务于冲突和反转的人物设定。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}\n标题钩子：${stringifyJson(hookPackage)}`,
    schema: characterDesignerSchema,
  });

  await prisma.character.deleteMany({ where: { projectId } });
  await Promise.all(
    characterOutput.characters.map((character) =>
      prisma.character.create({
        data: { projectId, ...character },
      }),
    ),
  );

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: "characters" },
  });

  const plotOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "PlotArchitectAgent",
    systemPrompt: PlotArchitectAgentPrompt,
    userPrompt: `请生成短篇大纲、场景卡、伏笔表、反转表。为了避免网关超时，输出必须精简：sceneCards 控制在 8 到 10 个；每个字段只写 1 句；outline 控制在 8 条以内；foreshadowingMap 和 twistMap 各控制在 5 条以内。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}\n钩子包：${stringifyJson(hookPackage)}\n人物：${stringifyJson(characterOutput)}`,
    schema: plotArchitectSchema,
    llmOverrides: { maxTokens: 4500 },
  });

  const outline = await savePlotArtifacts(projectId, plotOutput);
  await saveInitialStoryBible(projectId, characterOutput, plotOutput);

  try {
    const logicOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "LogicCriticAgent",
      systemPrompt: LogicCriticAgentPrompt,
      userPrompt: `请检查人物和大纲逻辑：\n人物：${stringifyJson(characterOutput)}\n大纲：${stringifyJson(plotOutput)}`,
      schema: criticSchema,
    });

    const emotionOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "EmotionEditorAgent",
      systemPrompt: EmotionEditorAgentPrompt,
      userPrompt: `请检查大纲情绪价值：\n${stringifyJson(plotOutput)}`,
      schema: criticSchema,
    });

    const chiefOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "ChiefEditorAgent",
      systemPrompt: ChiefEditorAgentPrompt,
      userPrompt: `请裁决大纲修改意见。\n人物：${stringifyJson(characterOutput)}\n大纲：${stringifyJson(plotOutput)}\n逻辑评价：${stringifyJson(logicOutput)}\n情绪评价：${stringifyJson(emotionOutput)}`,
      schema: chiefEditorSchema,
    });

    await saveReviewReport({
      projectId,
      workflowType,
      targetType: "Outline",
      targetId: outline.id,
      summary: chiefOutput.summary,
      scores: {
        logic: logicOutput.scores,
        emotion: emotionOutput.scores,
        chief: chiefOutput.overallScore,
      },
      details: { logicOutput, emotionOutput, chiefOutput },
    });

    return { outline, chief: chiefOutput };
  } catch (error) {
    const warning = compactErrorMessage(error);
    await saveReviewReport({
      projectId,
      workflowType,
      targetType: "Outline",
      targetId: outline.id,
      summary: `大纲已生成，后置评审未完成：${warning}`,
      details: { warning },
    });
    return { outline, reviewWarning: warning };
  }
}

async function savePlotArtifacts(projectId: string, plotOutput: PlotArchitectOutput) {
  await prisma.outline.deleteMany({ where: { projectId } });
  await prisma.sceneCard.deleteMany({ where: { projectId } });
  await prisma.foreshadowing.deleteMany({ where: { projectId } });
  await prisma.twist.deleteMany({ where: { projectId } });

  const outline = await prisma.outline.create({
    data: {
      projectId,
      storyArc: plotOutput.storyArc,
      outlineJson: stringifyJson(plotOutput.outline),
      conflictEscalation: plotOutput.conflictEscalation,
      emotionalCurveJson: stringifyJson(plotOutput.emotionalCurve),
      rawJson: stringifyJson({ plotOutput }),
    },
  });

  await Promise.all(
    plotOutput.sceneCards.map((scene, index) =>
      prisma.sceneCard.create({
        data: {
          projectId,
          orderIndex: index + 1,
          title: scene.title,
          goal: scene.goal,
          charactersJson: stringifyJson(scene.characters),
          location: scene.location,
          conflict: scene.conflict,
          informationGain: scene.informationGain,
          emotionalShift: scene.emotionalShift,
          mustIncludeJson: stringifyJson(scene.mustInclude),
          foreshadowingJson: stringifyJson(scene.foreshadowing),
          payoff: scene.payoff,
          forbiddenJson: stringifyJson(scene.forbidden),
        },
      }),
    ),
  );

  await Promise.all(
    plotOutput.foreshadowingMap.map((item) =>
      prisma.foreshadowing.create({
        data: {
          projectId,
          clue: item.clue,
          setupScene: item.setupScene,
          payoffScene: item.payoffScene,
          note: item.note,
        },
      }),
    ),
  );

  await Promise.all(
    plotOutput.twistMap.map((item) =>
      prisma.twist.create({
        data: {
          projectId,
          title: item.title,
          setup: item.setup,
          reveal: item.reveal,
          impact: item.impact,
        },
      }),
    ),
  );

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: "outline", previousSummary: plotOutput.storyArc },
  });

  return outline;
}

async function saveInitialStoryBible(
  projectId: string,
  characterOutput: { characters: Array<{ name: string; secret: string; role: string }> },
  plotOutput: PlotArchitectOutput,
) {
  const characterStates = Object.fromEntries(
    characterOutput.characters.map((character) => [
      character.name,
      `${character.role}；秘密：${character.secret}`,
    ]),
  );
  const openForeshadowing = plotOutput.foreshadowingMap.map((item) => item.clue);
  const timeline = plotOutput.outline;

  await prisma.storyBible.upsert({
    where: { projectId },
    update: {
      previousSummary: plotOutput.storyArc,
      unrevealedSecrets: stringifyJson(characterOutput.characters.map((item) => item.secret)),
      openForeshadowing: stringifyJson(openForeshadowing),
      characterStates: stringifyJson(characterStates),
      timeline: stringifyJson(timeline),
      rawJson: stringifyJson({ source: "generate_outline", plotOutput }),
    },
    create: {
      projectId,
      previousSummary: plotOutput.storyArc,
      unrevealedSecrets: stringifyJson(characterOutput.characters.map((item) => item.secret)),
      openForeshadowing: stringifyJson(openForeshadowing),
      characterStates: stringifyJson(characterStates),
      timeline: stringifyJson(timeline),
      rawJson: stringifyJson({ source: "generate_outline", plotOutput }),
    },
  });
}
