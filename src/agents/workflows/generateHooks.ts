import { prisma } from "@/db/prisma";
import { stringifyJson } from "@/lib/utils";
import { runAgent } from "../orchestrator";
import {
  ChiefEditorAgentPrompt,
  EmotionEditorAgentPrompt,
  HookEditorAgentPrompt,
  ReaderRepresentativeAgentPrompt,
} from "../prompts";
import { chiefEditorSchema, criticSchema, hookEditorSchema, readerSchema } from "../schemas";
import { getProjectOrThrow, projectBrief, saveReviewReport } from "./helpers";

export async function generateHooks(projectId: string) {
  const workflowType = "generate_hooks";
  const project = await getProjectOrThrow(projectId);
  const direction =
    (project.selectedDirectionId &&
      (await prisma.storyDirection.findUnique({ where: { id: project.selectedDirectionId } }))) ||
    (await prisma.storyDirection.findFirst({ where: { projectId }, orderBy: { createdAt: "asc" } }));

  const hookOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "HookEditorAgent",
    systemPrompt: HookEditorAgentPrompt,
    userPrompt: `请为以下项目和故事方向生成标题钩子包。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}`,
    schema: hookEditorSchema,
  });

  const readerOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "ReaderRepresentativeAgent",
    systemPrompt: ReaderRepresentativeAgentPrompt,
    userPrompt: `请评价这些标题、简介和开篇是否吸引普通读者：\n${stringifyJson(hookOutput)}`,
    schema: readerSchema,
  });

  const emotionOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "EmotionEditorAgent",
    systemPrompt: EmotionEditorAgentPrompt,
    userPrompt: `请检查这些标题钩子的情绪浓度：\n${stringifyJson(hookOutput)}`,
    schema: criticSchema,
  });

  const chiefOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "ChiefEditorAgent",
    systemPrompt: ChiefEditorAgentPrompt,
    userPrompt: `请选择最佳标题、简介和开篇钩子。\n钩子包：${stringifyJson(hookOutput)}\n读者评价：${stringifyJson(readerOutput)}\n情绪评价：${stringifyJson(emotionOutput)}`,
    schema: chiefEditorSchema,
  });

  const hookPackage = await prisma.hookPackage.create({
    data: {
      projectId,
      titlesJson: stringifyJson(hookOutput.titles),
      loglinesJson: stringifyJson(hookOutput.loglines),
      openingHooksJson: stringifyJson(hookOutput.openingHooks),
      openingSamplesJson: stringifyJson(hookOutput.openingSamples),
      readerReviewJson: stringifyJson(readerOutput),
      emotionReviewJson: stringifyJson(emotionOutput),
      chiefDecisionJson: stringifyJson(chiefOutput),
      selectedTitle: hookOutput.titles[0],
      selectedLogline: hookOutput.loglines[0],
      selectedHook: hookOutput.openingHooks[0],
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: "hooks" },
  });

  await saveReviewReport({
    projectId,
    workflowType,
    targetType: "HookPackage",
    targetId: hookPackage.id,
    summary: chiefOutput.summary,
    scores: {
      reader: readerOutput.scores,
      emotion: emotionOutput.scores,
      chief: chiefOutput.overallScore,
    },
    details: { readerOutput, emotionOutput, chiefOutput },
  });

  return { hookPackage, chief: chiefOutput };
}
