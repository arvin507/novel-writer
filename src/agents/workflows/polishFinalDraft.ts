import { prisma } from "@/db/prisma";
import { stringifyJson } from "@/lib/utils";
import { runAgent } from "../orchestrator";
import { PolishAgentPrompt } from "../prompts";
import { polishSchema } from "../schemas";
import { reviewDraft } from "./reviewDraft";
import { saveReviewReport } from "./helpers";

export async function polishFinalDraft(projectId: string) {
  const workflowType = "polish_final_draft";
  const review = await reviewDraft(projectId);
  const segments = await prisma.draftSegment.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { sceneCard: true },
  });
  const fullDraft = segments
    .sort((a, b) => (a.sceneCard?.orderIndex ?? 9999) - (b.sceneCard?.orderIndex ?? 9999))
    .map((segment) => `## ${segment.title}\n${segment.content}`)
    .join("\n\n");

  const polishOutput = await runAgent({
    projectId,
    workflowType,
    agentName: "PolishAgent",
    systemPrompt: PolishAgentPrompt,
    userPrompt: `请最终润色全文，不改变剧情事实。\n主编最终意见：${stringifyJson(review.chief)}\n正文：${fullDraft}`,
    schema: polishSchema,
  });

  const report = await saveReviewReport({
    projectId,
    workflowType,
    targetType: "FullDraft",
    summary: polishOutput.report,
    details: { review, polishOutput },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: "polished" },
  });

  return { report, polish: polishOutput };
}
