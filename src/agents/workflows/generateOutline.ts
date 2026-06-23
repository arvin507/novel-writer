import { prisma } from "@/db/prisma";
import { safeJsonParse, stringifyJson } from "@/lib/utils";
import { runAgent } from "../orchestrator";
import {
  CharacterDesignerAgentPrompt,
  ChiefEditorAgentPrompt,
  EmotionEditorAgentPrompt,
  LogicCriticAgentPrompt,
  OutlineCriticAgentPrompt,
  OutlineIntegratorAgentPrompt,
  OutlineProposerAgentPrompt,
  PlotArchitectAgentPrompt,
} from "../prompts";
import {
  characterDesignerSchema,
  chiefEditorSchema,
  criticSchema,
  discussionCriticSchema,
  plotArchitectSchema,
  type PlotArchitectOutput,
} from "../schemas";
import { compactErrorMessage, getProjectOrThrow, projectBrief, saveReviewReport } from "./helpers";

const MAX_OUTLINE_DISCUSSION_ROUNDS = 3;

type ChiefGuidance = {
  summary?: string;
  coreProblems?: string[];
  acceptedSuggestions?: string[];
  rejectedSuggestions?: string[];
  rewriteInstructions?: string[];
  nextAction?: string;
  reason?: string;
};

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

  let plotOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "OutlineProposerAgent",
    systemPrompt: OutlineProposerAgentPrompt,
    userPrompt: `请先提出一版短篇大纲和场景卡。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}\n钩子包：${stringifyJson(hookPackage)}\n人物：${stringifyJson(characterOutput)}`,
    schema: plotArchitectSchema,
    llmOverrides: { maxTokens: 4500 },
  });
  const discussionRounds: Array<Record<string, unknown>> = [
    { round: 1, proposer: plotOutput },
  ];

  for (let round = 1; round <= MAX_OUTLINE_DISCUSSION_ROUNDS; round += 1) {
    const outlineCriticOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "OutlineCriticAgent",
      systemPrompt: OutlineCriticAgentPrompt,
      userPrompt: `请只找问题，不要给建议。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}\n人物：${stringifyJson(characterOutput)}\n当前大纲与场景卡：${stringifyJson(plotOutput)}`,
      schema: discussionCriticSchema,
    });
    discussionRounds[discussionRounds.length - 1].critic = outlineCriticOutput;

    if (round === MAX_OUTLINE_DISCUSSION_ROUNDS || outlineCriticOutput.issues.length === 0) {
      break;
    }

    plotOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "OutlineIntegratorAgent",
      systemPrompt: OutlineIntegratorAgentPrompt,
      userPrompt: `请综合提案和批评意见，输出修订版大纲和场景卡。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}\n钩子包：${stringifyJson(hookPackage)}\n人物：${stringifyJson(characterOutput)}\n当前提案：${stringifyJson(plotOutput)}\n批评意见：${stringifyJson(outlineCriticOutput)}`,
      schema: plotArchitectSchema,
      llmOverrides: { maxTokens: 4500 },
    });
    discussionRounds.push({
      round: round + 1,
      proposer: plotOutput,
    });
  }

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
      details: { discussionRounds, characterOutput, plotOutput, logicOutput, emotionOutput, chiefOutput },
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

export async function reviseOutline(projectId: string) {
  const workflowType = "revise_outline";
  const project = await getProjectOrThrow(projectId);
  const direction = await prisma.storyDirection.findFirst({
    where: { projectId, id: project.selectedDirectionId ?? undefined },
  });
  const hookPackage = await prisma.hookPackage.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const characters = await prisma.character.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const currentOutline = await prisma.outline.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const currentSceneCards = await prisma.sceneCard.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
  });
  if (!currentOutline || currentSceneCards.length === 0) {
    throw new Error("还没有大纲和场景卡，无法按主编意见修订。");
  }

  const latestReport = await prisma.reviewReport.findFirst({
    where: { projectId, workflowType: { in: ["revise_outline", "generate_outline"] } },
    orderBy: { createdAt: "desc" },
  });
  const reportDetails = safeJsonParse<{ chiefOutput?: ChiefGuidance }>(latestReport?.detailsJson, {});
  const chiefGuidance = reportDetails.chiefOutput ?? {};
  const foreshadowings = await prisma.foreshadowing.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const twists = await prisma.twist.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  const currentPlan = {
    storyArc: currentOutline.storyArc,
    outline: safeJsonParse<string[]>(currentOutline.outlineJson, []),
    conflictEscalation: currentOutline.conflictEscalation,
    emotionalCurve: safeJsonParse<string[]>(currentOutline.emotionalCurveJson, []),
    sceneCards: currentSceneCards.map(serializeSceneCardForRevision),
    foreshadowingMap: foreshadowings.map((item) => ({
      clue: item.clue,
      setupScene: item.setupScene,
      payoffScene: item.payoffScene,
      note: item.note,
    })),
    twistMap: twists.map((item) => ({
      title: item.title,
      setup: item.setup,
      reveal: item.reveal,
      impact: item.impact,
    })),
  };

  const plotOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "PlotArchitectAgent",
    systemPrompt: PlotArchitectAgentPrompt,
    userPrompt: `请按主编结论修订现有大纲和场景卡，不要重写人物设定，不要从零另起故事。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}\n钩子包：${stringifyJson(hookPackage)}\n人物：${stringifyJson(characters)}\n当前大纲与场景卡：${stringifyJson(currentPlan)}\n主编结论：${stringifyJson(chiefGuidance)}\n要求：优先解决 coreProblems 和 rewriteInstructions；保留仍然有效的场景顺序和伏笔；如果需要调整场景卡，请给出完整 sceneCards 列表。`,
    schema: plotArchitectSchema,
    llmOverrides: { maxTokens: 4500 },
  });

  const outline = await savePlotArtifacts(projectId, plotOutput, { preserveSceneIds: true });
  await updateStoryBibleForPlot(projectId, plotOutput, "revise_outline");

  try {
    const logicOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "LogicCriticAgent",
      systemPrompt: LogicCriticAgentPrompt,
      userPrompt: `请检查修订后的大纲和场景卡是否解决了主编指出的逻辑问题。\n主编结论：${stringifyJson(chiefGuidance)}\n修订结果：${stringifyJson(plotOutput)}`,
      schema: criticSchema,
    });

    const emotionOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "EmotionEditorAgent",
      systemPrompt: EmotionEditorAgentPrompt,
      userPrompt: `请检查修订后的大纲情绪曲线和场景卡是否解决了主编指出的情绪问题。\n主编结论：${stringifyJson(chiefGuidance)}\n修订结果：${stringifyJson(plotOutput)}`,
      schema: criticSchema,
    });

    const chiefOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "ChiefEditorAgent",
      systemPrompt: ChiefEditorAgentPrompt,
      userPrompt: `请裁决修订后的大纲和场景卡是否可以进入正文写作。\n上一轮主编结论：${stringifyJson(chiefGuidance)}\n修订结果：${stringifyJson(plotOutput)}\n逻辑评价：${stringifyJson(logicOutput)}\n情绪评价：${stringifyJson(emotionOutput)}`,
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
      details: { revisedFromOutlineId: currentOutline.id, chiefGuidance, logicOutput, emotionOutput, chiefOutput },
    });

    return { outline, chief: chiefOutput, revisedFromOutlineId: currentOutline.id };
  } catch (error) {
    const warning = compactErrorMessage(error);
    await saveReviewReport({
      projectId,
      workflowType,
      targetType: "Outline",
      targetId: outline.id,
      summary: `大纲已按主编意见修订，后置评审未完成：${warning}`,
      details: { revisedFromOutlineId: currentOutline.id, chiefGuidance, warning },
    });
    return { outline, reviewWarning: warning, revisedFromOutlineId: currentOutline.id };
  }
}

async function savePlotArtifacts(
  projectId: string,
  plotOutput: PlotArchitectOutput,
  options: { preserveSceneIds?: boolean } = {},
) {
  let outline;
  if (options.preserveSceneIds) {
    const existingOutline = await prisma.outline.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    outline = existingOutline
      ? await prisma.outline.update({
          where: { id: existingOutline.id },
          data: {
            storyArc: plotOutput.storyArc,
            outlineJson: stringifyJson(plotOutput.outline),
            conflictEscalation: plotOutput.conflictEscalation,
            emotionalCurveJson: stringifyJson(plotOutput.emotionalCurve),
            rawJson: stringifyJson({ source: "revise_outline", plotOutput }),
          },
        })
      : await prisma.outline.create({
          data: {
            projectId,
            storyArc: plotOutput.storyArc,
            outlineJson: stringifyJson(plotOutput.outline),
            conflictEscalation: plotOutput.conflictEscalation,
            emotionalCurveJson: stringifyJson(plotOutput.emotionalCurve),
            rawJson: stringifyJson({ source: "revise_outline", plotOutput }),
          },
        });
  } else {
    await prisma.outline.deleteMany({ where: { projectId } });
    await prisma.sceneCard.deleteMany({ where: { projectId } });

    outline = await prisma.outline.create({
      data: {
        projectId,
        storyArc: plotOutput.storyArc,
        outlineJson: stringifyJson(plotOutput.outline),
        conflictEscalation: plotOutput.conflictEscalation,
        emotionalCurveJson: stringifyJson(plotOutput.emotionalCurve),
        rawJson: stringifyJson({ plotOutput }),
      },
    });
  }

  await prisma.foreshadowing.deleteMany({ where: { projectId } });
  await prisma.twist.deleteMany({ where: { projectId } });

  if (options.preserveSceneIds) {
    const existingScenes = await prisma.sceneCard.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
    });
    const existingByOrder = new Map(existingScenes.map((scene) => [scene.orderIndex, scene]));

    await Promise.all(
      plotOutput.sceneCards.map((scene, index) => {
        const orderIndex = index + 1;
        const data = sceneCardData(projectId, orderIndex, scene);
        const existingScene = existingByOrder.get(orderIndex);
        return existingScene
          ? prisma.sceneCard.update({ where: { id: existingScene.id }, data })
          : prisma.sceneCard.create({ data });
      }),
    );

    const keptOrderIndexes = plotOutput.sceneCards.map((_, index) => index + 1);
    await prisma.sceneCard.deleteMany({
      where: {
        projectId,
        orderIndex: { notIn: keptOrderIndexes },
      },
    });
  } else {
    await Promise.all(
      plotOutput.sceneCards.map((scene, index) =>
        prisma.sceneCard.create({
          data: sceneCardData(projectId, index + 1, scene),
        }),
      ),
    );
  }

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

function sceneCardData(
  projectId: string,
  orderIndex: number,
  scene: PlotArchitectOutput["sceneCards"][number],
) {
  return {
    projectId,
    orderIndex,
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
  };
}

function serializeSceneCardForRevision(sceneCard: {
  orderIndex: number;
  title: string;
  goal: string;
  charactersJson: string;
  location: string;
  conflict: string;
  informationGain: string;
  emotionalShift: string;
  mustIncludeJson: string;
  foreshadowingJson: string;
  payoff: string;
  forbiddenJson: string;
}) {
  return {
    orderIndex: sceneCard.orderIndex,
    title: sceneCard.title,
    goal: sceneCard.goal,
    characters: safeJsonParse<string[]>(sceneCard.charactersJson, []),
    location: sceneCard.location,
    conflict: sceneCard.conflict,
    informationGain: sceneCard.informationGain,
    emotionalShift: sceneCard.emotionalShift,
    mustInclude: safeJsonParse<string[]>(sceneCard.mustIncludeJson, []),
    foreshadowing: safeJsonParse<string[]>(sceneCard.foreshadowingJson, []),
    payoff: sceneCard.payoff,
    forbidden: safeJsonParse<string[]>(sceneCard.forbiddenJson, []),
  };
}

async function updateStoryBibleForPlot(
  projectId: string,
  plotOutput: PlotArchitectOutput,
  source: string,
) {
  await prisma.storyBible.upsert({
    where: { projectId },
    update: {
      previousSummary: plotOutput.storyArc,
      openForeshadowing: stringifyJson(plotOutput.foreshadowingMap.map((item) => item.clue)),
      timeline: stringifyJson(plotOutput.outline),
      rawJson: stringifyJson({ source, plotOutput }),
    },
    create: {
      projectId,
      previousSummary: plotOutput.storyArc,
      openForeshadowing: stringifyJson(plotOutput.foreshadowingMap.map((item) => item.clue)),
      timeline: stringifyJson(plotOutput.outline),
      rawJson: stringifyJson({ source, plotOutput }),
    },
  });
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
