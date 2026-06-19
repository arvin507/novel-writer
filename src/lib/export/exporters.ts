import fs from "node:fs/promises";
import path from "node:path";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { prisma } from "@/db/prisma";
import { safeJsonParse, slugifyFileName, stringifyJson } from "@/lib/utils";

export type ExportType =
  | "draft_markdown"
  | "draft_txt"
  | "draft_docx"
  | "story_bible_markdown"
  | "outline_markdown"
  | "submission_report_markdown";

const exportDir = path.join(process.cwd(), "exports");

export async function exportProject(projectId: string, type: ExportType) {
  await fs.mkdir(exportDir, { recursive: true });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      storyDirections: true,
      hookPackages: { orderBy: { createdAt: "desc" }, take: 1 },
      characters: true,
      outlines: { orderBy: { createdAt: "desc" }, take: 1 },
      sceneCards: { orderBy: { orderIndex: "asc" } },
      draftSegments: { orderBy: { createdAt: "asc" } },
      storyBible: true,
      foreshadowings: true,
      twists: true,
      reviewReports: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!project) throw new Error("项目不存在。");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${slugifyFileName(project.title)}-${type}-${stamp}`;
  let fileName = `${baseName}.md`;
  let bytes: Buffer | string = "";

  if (type === "draft_markdown") {
    bytes = buildDraftMarkdown(project);
  } else if (type === "draft_txt") {
    fileName = `${baseName}.txt`;
    bytes = buildDraftText(project);
  } else if (type === "draft_docx") {
    fileName = `${baseName}.docx`;
    bytes = await buildDraftDocx(project);
  } else if (type === "story_bible_markdown") {
    bytes = buildStoryBibleMarkdown(project);
  } else if (type === "outline_markdown") {
    bytes = buildOutlineMarkdown(project);
  } else {
    bytes = buildSubmissionReportMarkdown(project);
  }

  const filePath = path.join(exportDir, fileName);
  await fs.writeFile(filePath, bytes);

  return prisma.exportFile.create({
    data: {
      projectId,
      type,
      fileName,
      path: filePath,
    },
  });
}

function buildDraftMarkdown(project: ExportProject) {
  const title = `# ${project.title}`;
  const body = project.draftSegments
    .map((segment) => `## ${segment.title}\n\n${segment.content}`)
    .join("\n\n");
  return `${title}\n\n${body}\n`;
}

function buildDraftText(project: ExportProject) {
  return project.draftSegments
    .map((segment) => `${segment.title}\n\n${segment.content}`)
    .join("\n\n");
}

async function buildDraftDocx(project: ExportProject) {
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: project.title, bold: true, size: 32 })],
    }),
  ];

  for (const segment of project.draftSegments) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: segment.title, bold: true, size: 26 })],
      }),
    );
    for (const paragraph of segment.content.split(/\n+/).filter(Boolean)) {
      children.push(new Paragraph({ text: paragraph }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

function buildStoryBibleMarkdown(project: ExportProject) {
  const hookPackage = project.hookPackages[0];
  const bible = project.storyBible;

  return [
    `# ${project.title} 设定集`,
    "",
    "## 项目简报",
    `- 类型：${project.genre}`,
    `- 关键词：${project.keywords}`,
    `- 目标字数：${project.targetWordCount}`,
    `- 叙事视角：${project.pov}`,
    `- 结局倾向：${project.endingPreference}`,
    `- 情绪基调：${project.emotionalTone}`,
    "",
    "## 标题钩子",
    hookPackage ? `- 标题：${hookPackage.selectedTitle ?? ""}\n- 简介：${hookPackage.selectedLogline ?? ""}\n- 钩子：${hookPackage.selectedHook ?? ""}` : "暂无",
    "",
    "## 人物",
    ...project.characters.map(
      (item) =>
        `### ${item.name}\n- 角色：${item.role}\n- 身份：${item.identity}\n- 表层目标：${item.surfaceGoal}\n- 真实欲望：${item.trueDesire}\n- 弱点：${item.weakness}\n- 秘密：${item.secret}\n- 关系：${item.relationshipToProtagonist}\n- 功能：${item.plotFunction}\n- 转折：${item.turningPoint}\n- 结局：${item.ending}`,
    ),
    "",
    "## Story Bible",
    bible ? stringifyJson({
      previousSummary: bible.previousSummary,
      happenedEvents: safeJsonParse<string[]>(bible.happenedEvents, []),
      revealedSecrets: safeJsonParse<string[]>(bible.revealedSecrets, []),
      unrevealedSecrets: safeJsonParse<string[]>(bible.unrevealedSecrets, []),
      openForeshadowing: safeJsonParse<string[]>(bible.openForeshadowing, []),
      resolvedForeshadowing: safeJsonParse<string[]>(bible.resolvedForeshadowing, []),
      characterStates: safeJsonParse<Record<string, string>>(bible.characterStates, {}),
      timeline: safeJsonParse<string[]>(bible.timeline, []),
    }) : "暂无",
  ].join("\n");
}

function buildOutlineMarkdown(project: ExportProject) {
  const outline = project.outlines[0];
  return [
    `# ${project.title} 大纲与场景卡`,
    "",
    "## 故事弧",
    outline?.storyArc ?? "暂无",
    "",
    "## 大纲",
    ...(outline ? safeJsonParse<string[]>(outline.outlineJson, []).map((item) => `- ${item}`) : ["暂无"]),
    "",
    "## 场景卡",
    ...project.sceneCards.map(
      (scene) =>
        `### ${scene.orderIndex}. ${scene.title}\n- 目标：${scene.goal}\n- 角色：${safeJsonParse<string[]>(scene.charactersJson, []).join("、")}\n- 地点：${scene.location}\n- 冲突：${scene.conflict}\n- 信息增量：${scene.informationGain}\n- 情绪变化：${scene.emotionalShift}\n- 必须包含：${safeJsonParse<string[]>(scene.mustIncludeJson, []).join("、")}\n- 伏笔：${safeJsonParse<string[]>(scene.foreshadowingJson, []).join("、")}\n- 回收：${scene.payoff}`,
    ),
    "",
    "## 伏笔表",
    ...project.foreshadowings.map((item) => `- ${item.clue}｜铺设：${item.setupScene}｜回收：${item.payoffScene}`),
    "",
    "## 反转表",
    ...project.twists.map((item) => `- ${item.title}｜铺垫：${item.setup}｜揭示：${item.reveal}｜影响：${item.impact}`),
  ].join("\n");
}

function buildSubmissionReportMarkdown(project: ExportProject) {
  return [
    `# ${project.title} 投稿自检报告`,
    "",
    ...project.reviewReports.map(
      (report) =>
        `## ${report.workflowType}\n- 时间：${report.createdAt.toISOString()}\n- 摘要：${report.summary}\n\n### 分数\n${report.scoresJson}\n\n### 详情\n${report.detailsJson}`,
    ),
  ].join("\n");
}

type ExportProject = NonNullable<Awaited<ReturnType<typeof prisma.project.findUnique>>> & {
  storyDirections: Awaited<ReturnType<typeof prisma.storyDirection.findMany>>;
  hookPackages: Awaited<ReturnType<typeof prisma.hookPackage.findMany>>;
  characters: Awaited<ReturnType<typeof prisma.character.findMany>>;
  outlines: Awaited<ReturnType<typeof prisma.outline.findMany>>;
  sceneCards: Awaited<ReturnType<typeof prisma.sceneCard.findMany>>;
  draftSegments: Awaited<ReturnType<typeof prisma.draftSegment.findMany>>;
  storyBible: Awaited<ReturnType<typeof prisma.storyBible.findUnique>>;
  foreshadowings: Awaited<ReturnType<typeof prisma.foreshadowing.findMany>>;
  twists: Awaited<ReturnType<typeof prisma.twist.findMany>>;
  reviewReports: Awaited<ReturnType<typeof prisma.reviewReport.findMany>>;
};
