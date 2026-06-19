import { prisma } from "@/db/prisma";
import { stringifyJson } from "@/lib/utils";
import { runAgent } from "../orchestrator";
import {
  ChiefEditorAgentPrompt,
  ContinuityAgentPrompt,
  EmotionEditorAgentPrompt,
  LogicCriticAgentPrompt,
  ReaderRepresentativeAgentPrompt,
} from "../prompts";
import { chiefEditorSchema, continuitySchema, criticSchema, readerSchema } from "../schemas";
import { saveReviewReport } from "./helpers";

export async function reviewDraft(projectId: string) {
  const workflowType = "review_draft";
  const segments = await prisma.draftSegment.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { sceneCard: true },
  });
  const fullDraft = segments
    .sort((a, b) => (a.sceneCard?.orderIndex ?? 9999) - (b.sceneCard?.orderIndex ?? 9999))
    .map((segment) => `## ${segment.title}\n${segment.content}`)
    .join("\n\n");

  if (!fullDraft.trim()) throw new Error("还没有正文可审稿。");

  const logicOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "LogicCriticAgent",
    systemPrompt: LogicCriticAgentPrompt,
    userPrompt: `请全文检查逻辑问题：\n${fullDraft}`,
    schema: criticSchema,
  });

  const continuityOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "ContinuityAgent",
    systemPrompt: ContinuityAgentPrompt,
    userPrompt: `请全文检查一致性并给出 Story Bible 更新：\n${fullDraft}`,
    schema: continuitySchema,
  });

  const emotionOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "EmotionEditorAgent",
    systemPrompt: EmotionEditorAgentPrompt,
    userPrompt: `请全文检查情绪曲线：\n${fullDraft}`,
    schema: criticSchema,
  });

  const readerOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "ReaderRepresentativeAgent",
    systemPrompt: ReaderRepresentativeAgentPrompt,
    userPrompt: `请判断全文完读风险：\n${fullDraft}`,
    schema: readerSchema,
  });

  const chiefOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "ChiefEditorAgent",
    systemPrompt: ChiefEditorAgentPrompt,
    userPrompt: `请输出最终修改清单。\n逻辑：${stringifyJson(logicOutput)}\n一致性：${stringifyJson(continuityOutput)}\n情绪：${stringifyJson(emotionOutput)}\n读者：${stringifyJson(readerOutput)}`,
    schema: chiefEditorSchema,
  });

  const report = await saveReviewReport({
    projectId,
    workflowType,
    targetType: "FullDraft",
    summary: chiefOutput.summary,
    scores: {
      logic: logicOutput.scores,
      continuity: continuityOutput.scores,
      emotion: emotionOutput.scores,
      reader: readerOutput.scores,
      chief: chiefOutput.overallScore,
    },
    details: { logicOutput, continuityOutput, emotionOutput, readerOutput, chiefOutput },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: "reviewed" },
  });

  return { report, chief: chiefOutput };
}
