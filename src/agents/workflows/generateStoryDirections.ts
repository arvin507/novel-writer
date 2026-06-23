import { prisma } from "@/db/prisma";
import { stringifyJson } from "@/lib/utils";
import { runAgent } from "../orchestrator";
import {
  ChiefEditorAgentPrompt,
  LogicCriticAgentPrompt,
  ReaderRepresentativeAgentPrompt,
  StoryDirectionCriticAgentPrompt,
  StoryDirectionIntegratorAgentPrompt,
  StoryDirectionProposerAgentPrompt,
} from "../prompts";
import {
  chiefEditorSchema,
  criticSchema,
  discussionCriticSchema,
  readerSchema,
  storyDirectionGenerationSchema,
} from "../schemas";
import { compactErrorMessage, getProjectOrThrow, projectBrief, saveReviewReport } from "./helpers";

const MAX_DISCUSSION_ROUNDS = 3;

export async function generateStoryDirections(projectId: string) {
  const workflowType = "generate_story_directions";
  const project = await getProjectOrThrow(projectId);
  const requestedCount = normalizeDirectionCount(project.storyDirectionCount);

  let currentOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "StoryDirectionProposerAgent",
    systemPrompt: StoryDirectionProposerAgentPrompt,
    userPrompt: `请基于以下项目简报提出 ${requestedCount} 个短篇故事方向。\n要求：方向之间要明显区分，不要重复换皮。\n项目简报：${projectBrief(project)}`,
    schema: storyDirectionGenerationSchema,
  });
  const discussionRounds: Array<Record<string, unknown>> = [
    { round: 1, proposer: currentOutput },
  ];

  for (let round = 1; round <= MAX_DISCUSSION_ROUNDS; round += 1) {
    const criticOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "StoryDirectionCriticAgent",
      systemPrompt: StoryDirectionCriticAgentPrompt,
      userPrompt: `请只找问题，不要给建议。\n目标方向数量：${requestedCount}\n项目简报：${projectBrief(project)}\n当前故事方向：${stringifyJson(currentOutput)}`,
      schema: discussionCriticSchema,
    });
    discussionRounds[discussionRounds.length - 1].critic = criticOutput;

    if (round === MAX_DISCUSSION_ROUNDS || criticOutput.issues.length === 0) {
      break;
    }

    currentOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "StoryDirectionIntegratorAgent",
      systemPrompt: StoryDirectionIntegratorAgentPrompt,
      userPrompt: `请综合提案和批评意见，输出修订版故事方向。\n目标方向数量：${requestedCount}\n项目简报：${projectBrief(project)}\n当前提案：${stringifyJson(currentOutput)}\n批评意见：${stringifyJson(criticOutput)}`,
      schema: storyDirectionGenerationSchema,
    });
    discussionRounds.push({
      round: round + 1,
      proposer: currentOutput,
    });
  }

  await prisma.storyDirection.deleteMany({ where: { projectId } });
  const created = await Promise.all(
    currentOutput.directions.slice(0, requestedCount).map((direction) =>
      prisma.storyDirection.create({
        data: {
          projectId,
          title: direction.title,
          logline: direction.logline,
          openingHook: direction.openingHook,
          coreConflict: direction.coreConflict,
          protagonistDilemma: direction.protagonistDilemma,
          mainTwist: direction.mainTwist,
          emotionalValue: direction.emotionalValue,
          targetReaders: direction.targetReaders,
          commercialScore: direction.commercialScore,
          risk: direction.risk,
          recommendationReason: direction.recommendationReason,
        },
      }),
    ),
  );

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: "story_directions" },
  });

  try {
    const readerOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "ReaderRepresentativeAgent",
      systemPrompt: ReaderRepresentativeAgentPrompt,
      userPrompt: `请以普通读者视角评价这些故事方向：\n${stringifyJson(currentOutput)}`,
      schema: readerSchema,
    });

    await prisma.storyDirection.updateMany({
      where: { projectId },
      data: { readerFeedbackJson: stringifyJson(readerOutput) },
    });

    const logicOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "LogicCriticAgent",
      systemPrompt: LogicCriticAgentPrompt,
      userPrompt: `请检查这些故事方向的逻辑风险：\n${stringifyJson(currentOutput)}`,
      schema: criticSchema,
    });

    await prisma.storyDirection.updateMany({
      where: { projectId },
      data: { logicFeedbackJson: stringifyJson(logicOutput) },
    });

    const chiefOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "ChiefEditorAgent",
      systemPrompt: ChiefEditorAgentPrompt,
      userPrompt: `请汇总评审并推荐最适合继续开发的 1 到 2 个故事方向。\n方向：${stringifyJson(currentOutput)}\n读者评价：${stringifyJson(readerOutput)}\n逻辑评价：${stringifyJson(logicOutput)}`,
      schema: chiefEditorSchema,
    });

    await prisma.storyDirection.updateMany({
      where: { projectId },
      data: { chiefDecisionJson: stringifyJson(chiefOutput) },
    });

    await saveReviewReport({
      projectId,
      workflowType,
      targetType: "StoryDirection",
      summary: chiefOutput.summary,
      scores: {
        reader: readerOutput.scores,
        logic: logicOutput.scores,
        chief: chiefOutput.overallScore,
      },
      details: { requestedCount, discussionRounds, finalDirections: currentOutput, readerOutput, logicOutput, chiefOutput },
    });

    return { directions: created, chief: chiefOutput };
  } catch (error) {
    const warning = compactErrorMessage(error);
    await saveReviewReport({
      projectId,
      workflowType,
      targetType: "StoryDirection",
      summary: `故事方向已生成，后置评审未完成：${warning}`,
      details: { requestedCount, discussionRounds, finalDirections: currentOutput, warning },
    });
    return { directions: created, reviewWarning: warning };
  }
}

function normalizeDirectionCount(value: number | null | undefined) {
  if (!value) return 3;
  return Math.min(4, Math.max(1, Math.round(value)));
}
