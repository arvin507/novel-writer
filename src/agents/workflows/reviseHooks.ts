import { prisma } from "@/db/prisma";
import { safeJsonParse, stringifyJson } from "@/lib/utils";
import { runAgent } from "../orchestrator";
import {
  ChiefEditorAgentPrompt,
  EmotionEditorAgentPrompt,
  HookCriticAgentPrompt,
  HookEditorAgentPrompt,
  HookIntegratorAgentPrompt,
  ReaderRepresentativeAgentPrompt,
} from "../prompts";
import {
  chiefEditorSchema,
  criticSchema,
  discussionCriticSchema,
  hookEditorSchema,
  readerSchema,
} from "../schemas";
import { getProjectOrThrow, projectBrief, saveReviewReport } from "./helpers";

const MAX_HOOK_DISCUSSION_ROUNDS = 3;

type ChiefGuidance = {
  summary?: string;
  coreProblems?: string[];
  acceptedSuggestions?: string[];
  rejectedSuggestions?: string[];
  rewriteInstructions?: string[];
  nextAction?: string;
  reason?: string;
};

export async function reviseHooks(projectId: string) {
  const workflowType = "revise_hooks";
  const project = await getProjectOrThrow(projectId);
  const currentHookPackage = await prisma.hookPackage.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  if (!currentHookPackage) throw new Error("还没有标题钩子包，无法按主编意见修订。");

  const direction =
    (project.selectedDirectionId &&
      (await prisma.storyDirection.findUnique({ where: { id: project.selectedDirectionId } }))) ||
    (await prisma.storyDirection.findFirst({ where: { projectId }, orderBy: { createdAt: "asc" } }));
  const chiefGuidance = safeJsonParse<ChiefGuidance>(currentHookPackage.chiefDecisionJson, {});
  const currentPackage = {
    selectedTitle: currentHookPackage.selectedTitle,
    selectedLogline: currentHookPackage.selectedLogline,
    selectedHook: currentHookPackage.selectedHook,
    titles: safeJsonParse<string[]>(currentHookPackage.titlesJson, []),
    loglines: safeJsonParse<string[]>(currentHookPackage.loglinesJson, []),
    openingHooks: safeJsonParse<string[]>(currentHookPackage.openingHooksJson, []),
    openingSamples: safeJsonParse<string[]>(currentHookPackage.openingSamplesJson, []),
    readerReview: safeJsonParse<Record<string, unknown>>(currentHookPackage.readerReviewJson, {}),
    emotionReview: safeJsonParse<Record<string, unknown>>(currentHookPackage.emotionReviewJson, {}),
    chiefGuidance,
  };

  let hookOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "HookEditorAgent",
    systemPrompt: HookEditorAgentPrompt,
    userPrompt: `请在保留当前钩子包有效卖点的基础上，严格按主编结论修订标题、简介、开篇钩子和开篇前三段版本。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}\n当前钩子包：${stringifyJson(currentPackage)}\n主编结论：${stringifyJson(chiefGuidance)}\n要求：不要从零另起炉灶；优先解决 coreProblems 和 rewriteInstructions；若 nextAction 是 ask_user，请根据已有问题给出更稳妥的修订版。`,
    schema: hookEditorSchema,
  });
  const discussionRounds: Array<Record<string, unknown>> = [
    { round: 1, proposer: hookOutput },
  ];

  for (let round = 1; round <= MAX_HOOK_DISCUSSION_ROUNDS; round += 1) {
    const hookCriticOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "HookCriticAgent",
      systemPrompt: HookCriticAgentPrompt,
      userPrompt: `请只找问题，不要给建议。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}\n上一轮主编结论：${stringifyJson(chiefGuidance)}\n修订后的标题钩子包：${stringifyJson(hookOutput)}`,
      schema: discussionCriticSchema,
    });
    discussionRounds[discussionRounds.length - 1].critic = hookCriticOutput;

    if (round === MAX_HOOK_DISCUSSION_ROUNDS || hookCriticOutput.issues.length === 0) {
      break;
    }

    hookOutput = await runAgent({
      projectId,
      workflowType,
      agentName: "HookIntegratorAgent",
      systemPrompt: HookIntegratorAgentPrompt,
      userPrompt: `请综合修订稿和批评意见，输出再次修订后的标题钩子包。\n项目：${projectBrief(project)}\n故事方向：${stringifyJson(direction)}\n当前钩子包：${stringifyJson(currentPackage)}\n上一轮主编结论：${stringifyJson(chiefGuidance)}\n当前修订稿：${stringifyJson(hookOutput)}\n批评意见：${stringifyJson(hookCriticOutput)}`,
      schema: hookEditorSchema,
    });
    discussionRounds.push({
      round: round + 1,
      proposer: hookOutput,
    });
  }

  const readerOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "ReaderRepresentativeAgent",
    systemPrompt: ReaderRepresentativeAgentPrompt,
    userPrompt: `请评价修订后的标题、简介和开篇是否更吸引普通读者：\n${stringifyJson(hookOutput)}`,
    schema: readerSchema,
  });

  const emotionOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "EmotionEditorAgent",
    systemPrompt: EmotionEditorAgentPrompt,
    userPrompt: `请检查修订后的标题钩子包是否解决了上一轮主编指出的情绪问题：\n${stringifyJson(hookOutput)}`,
    schema: criticSchema,
  });

  const chiefOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "ChiefEditorAgent",
    systemPrompt: ChiefEditorAgentPrompt,
    userPrompt: `请裁决修订后的标题钩子包是否可以进入下一步。\n上一轮主编结论：${stringifyJson(chiefGuidance)}\n修订后钩子包：${stringifyJson(hookOutput)}\n读者评价：${stringifyJson(readerOutput)}\n情绪评价：${stringifyJson(emotionOutput)}`,
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
    details: {
      revisedFromHookPackageId: currentHookPackage.id,
      chiefGuidance,
      discussionRounds,
      finalHookOutput: hookOutput,
      readerOutput,
      emotionOutput,
      chiefOutput,
    },
  });

  return { hookPackage, chief: chiefOutput, revisedFromHookPackageId: currentHookPackage.id };
}
