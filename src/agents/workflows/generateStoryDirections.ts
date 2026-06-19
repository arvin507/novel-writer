import { prisma } from "@/db/prisma";
import { stringifyJson } from "@/lib/utils";
import { runAgent } from "../orchestrator";
import {
  ChiefEditorAgentPrompt,
  LogicCriticAgentPrompt,
  ReaderRepresentativeAgentPrompt,
  TopicPlannerAgentPrompt,
} from "../prompts";
import { chiefEditorSchema, criticSchema, readerSchema, topicPlannerSchema } from "../schemas";
import { compactErrorMessage, getProjectOrThrow, projectBrief, saveReviewReport } from "./helpers";

export async function generateStoryDirections(projectId: string) {
  const workflowType = "generate_story_directions";
  const project = await getProjectOrThrow(projectId);

  const topicOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "TopicPlannerAgent",
    systemPrompt: TopicPlannerAgentPrompt,
    userPrompt: `请基于以下项目简报生成 5 个故事方向：\n${projectBrief(project)}`,
    schema: topicPlannerSchema,
  });

  await prisma.storyDirection.deleteMany({ where: { projectId } });
  const created = await Promise.all(
    topicOutput.directions.slice(0, 5).map((direction) =>
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
      userPrompt: `请以普通读者视角评价这些故事方向：\n${stringifyJson(topicOutput)}`,
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
      userPrompt: `请检查这些故事方向的逻辑风险：\n${stringifyJson(topicOutput)}`,
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
      userPrompt: `请汇总评审并推荐最适合继续开发的 1 到 2 个故事方向。\n方向：${stringifyJson(topicOutput)}\n读者评价：${stringifyJson(readerOutput)}\n逻辑评价：${stringifyJson(logicOutput)}`,
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
      details: { readerOutput, logicOutput, chiefOutput },
    });

    return { directions: created, chief: chiefOutput };
  } catch (error) {
    const warning = compactErrorMessage(error);
    await saveReviewReport({
      projectId,
      workflowType,
      targetType: "StoryDirection",
      summary: `故事方向已生成，后置评审未完成：${warning}`,
      details: { warning },
    });
    return { directions: created, reviewWarning: warning };
  }
}
