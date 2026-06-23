import { prisma } from "@/db/prisma";
import { countCjkWords, stringifyJson } from "@/lib/utils";
import { buildWritingContext } from "../context/buildWritingContext";
import { runAgent } from "../orchestrator";
import {
  ChiefEditorAgentPrompt,
  ContinuityAgentPrompt,
  DraftWriterAgentPrompt,
  EmotionEditorAgentPrompt,
  LogicCriticAgentPrompt,
  RewriteAgentPrompt,
} from "../prompts";
import {
  chiefEditorSchema,
  continuitySchema,
  criticSchema,
  draftWriterSchema,
  rewriteSchema,
} from "../schemas";
import { saveReviewReport } from "./helpers";

export async function writeScene(
  projectId: string,
  sceneCardId: string,
  workflowType: "write_scene" | "revise_scene" = "write_scene",
) {
  const isRevision = workflowType === "revise_scene";
  const sceneCard = await prisma.sceneCard.update({
    where: { id: sceneCardId },
    data: { status: "generating" },
  });

  const context = await buildWritingContext(projectId, sceneCardId);

  const draftOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "DraftWriterAgent",
    systemPrompt: DraftWriterAgentPrompt,
    userPrompt: isRevision
      ? `请根据上下文中的 currentDraft 和 currentDraftChiefDecision，按主编结论修订当前场景正文。保留可用段落，只解决主编指出的问题，不要从零另写一版。\n${context}`
      : `请根据以下上下文写当前场景正文：\n${context}`,
    schema: draftWriterSchema,
  });

  const logicOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "LogicCriticAgent",
    systemPrompt: LogicCriticAgentPrompt,
    userPrompt: `请审查这一场景正文的逻辑：\n${stringifyJson(draftOutput)}`,
    schema: criticSchema,
  });

  const emotionOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "EmotionEditorAgent",
    systemPrompt: EmotionEditorAgentPrompt,
    userPrompt: `请审查这一场景正文的情绪价值：\n${stringifyJson(draftOutput)}`,
    schema: criticSchema,
  });

  const continuityOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "ContinuityAgent",
    systemPrompt: ContinuityAgentPrompt,
    userPrompt: `请检查一致性并更新 Story Bible。\n上下文：${context}\n新正文：${stringifyJson(draftOutput)}`,
    schema: continuitySchema,
  });

  const chiefOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "ChiefEditorAgent",
    systemPrompt: ChiefEditorAgentPrompt,
    userPrompt: `请裁决是否需要改写。\n正文：${stringifyJson(draftOutput)}\n逻辑评价：${stringifyJson(logicOutput)}\n情绪评价：${stringifyJson(emotionOutput)}\n一致性评价：${stringifyJson(continuityOutput)}`,
    schema: chiefEditorSchema,
  });

  let finalContent = draftOutput.content;
  let rewriteOutput: unknown = null;
  if (chiefOutput.nextAction === "rewrite" && chiefOutput.rewriteInstructions.length > 0) {
    const rewritten = await runAgent({
      projectId,
      workflowType,
      agentName: "RewriteAgent",
      systemPrompt: RewriteAgentPrompt,
      userPrompt: `请按主编意见改写正文。\n写作上下文：${context}\n原文：${draftOutput.content}\n主编意见：${stringifyJson(chiefOutput.rewriteInstructions)}`,
      schema: rewriteSchema,
    });
    rewriteOutput = rewritten;
    finalContent = rewritten.rewrittenContent;
  }

  const status = chiefOutput.nextAction === "approve" ? "finalized" : "needs_revision";
  const existingSegment = await prisma.draftSegment.findFirst({
    where: { projectId, sceneCardId },
  });
  const segment = existingSegment
    ? await prisma.draftSegment.update({
        where: { id: existingSegment.id },
        data: {
          title: draftOutput.title || sceneCard.title,
          content: finalContent,
          status,
          wordCount: countCjkWords(finalContent),
          reviewJson: stringifyJson({ logicOutput, emotionOutput, continuityOutput }),
          chiefDecisionJson: stringifyJson(chiefOutput),
        },
      })
    : await prisma.draftSegment.create({
        data: {
          projectId,
          sceneCardId,
          title: draftOutput.title || sceneCard.title,
          content: finalContent,
          status,
          wordCount: countCjkWords(finalContent),
          reviewJson: stringifyJson({ logicOutput, emotionOutput, continuityOutput }),
          chiefDecisionJson: stringifyJson(chiefOutput),
        },
      });

  await prisma.draftVersion.create({
    data: {
      segmentId: segment.id,
      content: finalContent,
      reason: isRevision
        ? "按主编结论修订正文"
        : chiefOutput.nextAction === "rewrite"
          ? "AI 生成后按主编意见改写"
          : "AI 生成正文",
      createdByAgent: chiefOutput.nextAction === "rewrite" ? "RewriteAgent" : "DraftWriterAgent",
    },
  });

  await prisma.storyBible.upsert({
    where: { projectId },
    update: {
      previousSummary: continuityOutput.previousSummary,
      happenedEvents: stringifyJson(continuityOutput.happenedEvents),
      revealedSecrets: stringifyJson(continuityOutput.revealedSecrets),
      unrevealedSecrets: stringifyJson(continuityOutput.unrevealedSecrets),
      openForeshadowing: stringifyJson(continuityOutput.openForeshadowing),
      resolvedForeshadowing: stringifyJson(continuityOutput.resolvedForeshadowing),
      characterStates: stringifyJson(continuityOutput.characterStates),
      timeline: stringifyJson(continuityOutput.timeline),
      rawJson: stringifyJson(continuityOutput),
    },
    create: {
      projectId,
      previousSummary: continuityOutput.previousSummary,
      happenedEvents: stringifyJson(continuityOutput.happenedEvents),
      revealedSecrets: stringifyJson(continuityOutput.revealedSecrets),
      unrevealedSecrets: stringifyJson(continuityOutput.unrevealedSecrets),
      openForeshadowing: stringifyJson(continuityOutput.openForeshadowing),
      resolvedForeshadowing: stringifyJson(continuityOutput.resolvedForeshadowing),
      characterStates: stringifyJson(continuityOutput.characterStates),
      timeline: stringifyJson(continuityOutput.timeline),
      rawJson: stringifyJson(continuityOutput),
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: "drafting", previousSummary: continuityOutput.previousSummary },
  });
  await prisma.sceneCard.update({
    where: { id: sceneCardId },
    data: { status },
  });

  await saveReviewReport({
    projectId,
    workflowType,
    targetType: "DraftSegment",
    targetId: segment.id,
    summary: chiefOutput.summary,
    scores: {
      logic: logicOutput.scores,
      emotion: emotionOutput.scores,
      continuity: continuityOutput.scores,
      chief: chiefOutput.overallScore,
    },
    details: { logicOutput, emotionOutput, continuityOutput, chiefOutput, rewriteOutput },
  });

  return { segment, chief: chiefOutput };
}
