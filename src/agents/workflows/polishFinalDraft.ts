import { prisma } from "@/db/prisma";
import { safeJsonParse, stringifyJson, truncateText } from "@/lib/utils";
import { runAgent } from "../orchestrator";
import { PolishAgentPrompt } from "../prompts";
import { polishSchema } from "../schemas";
import { compactErrorMessage, saveReviewReport } from "./helpers";

const POLISH_CHUNK_CHAR_LIMIT = 4500;
const POLISH_MAX_TOKENS = 3000;

type ChiefGuidance = {
  summary?: string;
  overallScore?: number;
  coreProblems?: string[];
  acceptedSuggestions?: string[];
  rejectedSuggestions?: string[];
  rewriteInstructions?: string[];
  nextAction?: string;
};

type ReviewDetails = {
  chiefOutput?: ChiefGuidance;
  review?: {
    chief?: ChiefGuidance;
  };
};

type SegmentReport = {
  title: string;
  status: "success" | "partial_failed" | "failed";
  totalParts: number;
  failedParts: number;
  report: string;
  errors: string[];
};

export async function polishFinalDraft(projectId: string) {
  const workflowType = "polish_final_draft";
  const reviewGuidance = await buildReviewGuidance(projectId);
  const segments = await prisma.draftSegment.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { sceneCard: true },
  });
  const orderedSegments = segments.sort(
    (a, b) => (a.sceneCard?.orderIndex ?? 9999) - (b.sceneCard?.orderIndex ?? 9999),
  );

  if (!orderedSegments.some((segment) => segment.content.trim())) {
    throw new Error("还没有正文可润色。");
  }

  const segmentReports: SegmentReport[] = [];
  const polishedSections: string[] = [];
  let previousPolishedEnding = "";
  let totalParts = 0;
  let succeededParts = 0;

  for (let segmentIndex = 0; segmentIndex < orderedSegments.length; segmentIndex += 1) {
    const segment = orderedSegments[segmentIndex];
    const chunks = splitContentChunks(segment.content);
    const polishedChunks: string[] = [];
    const errors: string[] = [];
    const chunkReports: string[] = [];

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      totalParts += 1;

      try {
        const nextReference = buildNextReference({
          currentChunks: chunks,
          chunkIndex,
          nextSegment: orderedSegments[segmentIndex + 1],
        });
        const polishOutput = await runAgent({
          projectId,
          workflowType,
          agentName: "PolishAgent",
          systemPrompt: PolishAgentPrompt,
          userPrompt: buildPolishPrompt({
            reviewGuidance,
            segmentTitle: segment.title,
            segmentIndex,
            totalSegments: orderedSegments.length,
            chunk,
            chunkIndex,
            totalChunks: chunks.length,
            previousPolishedEnding,
            nextReference,
          }),
          schema: polishSchema,
          llmOverrides: { maxTokens: POLISH_MAX_TOKENS },
        });

        const polishedContent = stripMarkdownTitle(polishOutput.polishedContent, segment.title);
        polishedChunks.push(polishedContent);
        previousPolishedEnding = truncateText(polishedContent, 900);
        chunkReports.push(polishOutput.report);
        succeededParts += 1;
      } catch (error) {
        const message = compactErrorMessage(error, 500);
        errors.push(`第 ${chunkIndex + 1}/${chunks.length} 块：${message}`);
        polishedChunks.push(chunk.trim());
        previousPolishedEnding = truncateText(chunk, 900);
      }
    }

    const failedParts = errors.length;
    const segmentStatus =
      failedParts === 0 ? "success" : failedParts === chunks.length ? "failed" : "partial_failed";
    const mergedContent = polishedChunks.join("\n\n").trim();
    polishedSections.push(`## ${segment.title}\n${mergedContent}`);
    segmentReports.push({
      title: segment.title,
      status: segmentStatus,
      totalParts: chunks.length,
      failedParts,
      report: chunkReports.filter(Boolean).join("\n") || "该场景调用失败，已保留原文。",
      errors,
    });
  }

  if (succeededParts === 0) {
    throw new Error(
      `所有文本块润色都失败，未生成有效润色稿。最近错误：${
        segmentReports.flatMap((report) => report.errors).at(-1) ?? "未知错误"
      }`,
    );
  }

  const failedParts = totalParts - succeededParts;
  const polishOutput = {
    polishedContent: polishedSections.join("\n\n"),
    report: [
      `已按场景分段完成最终润色：${succeededParts}/${totalParts} 个文本块成功。`,
      failedParts
        ? `${failedParts} 个文本块调用失败，已在对应位置保留原文；可稍后重新运行。`
        : "所有文本块均已润色成功。",
      "处理边界：只调整语言、节奏、情绪推进和可读性，不主动改变剧情事实。",
    ].join(" "),
  };

  const report = await saveReviewReport({
    projectId,
    workflowType,
    targetType: "FullDraft",
    summary: polishOutput.report,
    details: { reviewGuidance, segmentReports, polishOutput },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: "polished" },
  });

  return { report, polish: polishOutput };
}

async function buildReviewGuidance(projectId: string) {
  const reviewReport = await prisma.reviewReport.findFirst({
    where: { projectId, workflowType: "review_draft" },
    orderBy: { createdAt: "desc" },
  });

  if (reviewReport) {
    const details = safeJsonParse<ReviewDetails>(reviewReport.detailsJson, {});
    const chief = details.chiefOutput ?? details.review?.chief;
    return truncateText(
      stringifyJson({
        reportSummary: reviewReport.summary,
        chiefSummary: chief?.summary,
        overallScore: chief?.overallScore,
        coreProblems: chief?.coreProblems?.slice(0, 6) ?? [],
        acceptedSuggestions: chief?.acceptedSuggestions?.slice(0, 6) ?? [],
        rejectedSuggestions: chief?.rejectedSuggestions?.slice(0, 4) ?? [],
        rewriteInstructions: chief?.rewriteInstructions?.slice(0, 8) ?? [],
        nextAction: chief?.nextAction,
      }),
      3000,
    );
  }

  const latestChiefRun = await prisma.agentRun.findFirst({
    where: {
      projectId,
      workflowType: "review_draft",
      agentName: "ChiefEditorAgent",
      status: "success",
    },
    orderBy: { createdAt: "desc" },
    select: { outputJson: true },
  });
  const chief = safeJsonParse<ChiefGuidance>(latestChiefRun?.outputJson, {});

  if (chief.summary || chief.rewriteInstructions?.length || chief.coreProblems?.length) {
    return truncateText(
      stringifyJson({
        chiefSummary: chief.summary,
        overallScore: chief.overallScore,
        coreProblems: chief.coreProblems?.slice(0, 6) ?? [],
        acceptedSuggestions: chief.acceptedSuggestions?.slice(0, 6) ?? [],
        rejectedSuggestions: chief.rejectedSuggestions?.slice(0, 4) ?? [],
        rewriteInstructions: chief.rewriteInstructions?.slice(0, 8) ?? [],
        nextAction: chief.nextAction,
      }),
      3000,
    );
  }

  return "暂无全文审稿报告；只做语言、节奏、代入感和可读性层面的最终润色，不新增剧情事实。";
}

function buildPolishPrompt(input: {
  reviewGuidance: string;
  segmentTitle: string;
  segmentIndex: number;
  totalSegments: number;
  chunk: string;
  chunkIndex: number;
  totalChunks: number;
  previousPolishedEnding: string;
  nextReference: string;
}) {
  return `请润色当前文本块，输出只包含当前文本块的结果。

规则：
- polishedContent 只放润色后的正文，不要包含 Markdown 标题，不要输出其他场景。
- 不改变剧情事实、人物关系、线索、视角、结局和场景顺序。
- 可以调整句式、节奏、过渡、情绪递进、错别字、病句和少量重复表达。
- 如果审稿意见与当前文本块无关，以当前文本块的原剧情为准。

全文审稿意见：
${input.reviewGuidance}

当前位置：第 ${input.segmentIndex + 1}/${input.totalSegments} 个场景；当前场景第 ${
    input.chunkIndex + 1
  }/${input.totalChunks} 个文本块。
当前场景标题：${input.segmentTitle}

前文润色结尾：
${input.previousPolishedEnding || "无，当前文本块是开头。"}

后文参考：
${input.nextReference}

当前文本块原文：
${input.chunk}`;
}

function buildNextReference(input: {
  currentChunks: string[];
  chunkIndex: number;
  nextSegment?: { title: string; content: string } | null;
}) {
  const nextChunk = input.currentChunks[input.chunkIndex + 1];
  if (nextChunk) {
    return `当前场景下一文本块开头：${truncateText(nextChunk, 700)}`;
  }
  if (input.nextSegment) {
    return `下一场景标题：${input.nextSegment.title}\n下一场景开头：${truncateText(
      input.nextSegment.content,
      700,
    )}`;
  }
  return "无，当前文本块是故事结尾。";
}

function splitContentChunks(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return [""];
  if (trimmed.length <= POLISH_CHUNK_CHAR_LIMIT) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/).map((paragraph) => paragraph.trim());
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!paragraph) continue;

    if (paragraph.length > POLISH_CHUNK_CHAR_LIMIT) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < paragraph.length; index += POLISH_CHUNK_CHAR_LIMIT) {
        chunks.push(paragraph.slice(index, index + POLISH_CHUNK_CHAR_LIMIT));
      }
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > POLISH_CHUNK_CHAR_LIMIT) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [trimmed];
}

function stripMarkdownTitle(content: string, title: string) {
  const trimmed = content.trim();
  const lines = trimmed.split(/\r?\n/);
  const firstLineTitle = lines[0]?.replace(/^#{1,6}\s*/, "").trim();
  if (firstLineTitle === title.trim()) {
    return lines.slice(1).join("\n").trim();
  }
  return trimmed;
}
