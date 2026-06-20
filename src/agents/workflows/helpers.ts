import { prisma } from "@/db/prisma";
import { buildPlatformInstruction, getPlatformProfile } from "@/lib/platforms";
import { stringifyJson } from "@/lib/utils";

export async function getProjectOrThrow(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project) throw new Error("项目不存在。");
  return project;
}

export function projectBrief(project: Awaited<ReturnType<typeof getProjectOrThrow>>) {
  const platformProfile = getPlatformProfile(project.targetPlatform);
  return stringifyJson({
    title: project.title,
    genre: project.genre,
    keywords: project.keywords,
    targetWordCount: project.targetWordCount,
    targetPlatform: platformProfile.label,
    platformRequirementOverride: project.platformRequirementOverride,
    platformInstruction: buildPlatformInstruction(project),
    pov: project.pov,
    endingPreference: project.endingPreference,
    emotionalTone: project.emotionalTone,
    originalIdea: project.originalIdea,
    forbiddenItems: project.forbiddenItems,
    currentStage: project.currentStage,
  });
}

export async function saveReviewReport(input: {
  projectId: string;
  workflowType: string;
  targetType: string;
  targetId?: string;
  summary: string;
  scores?: unknown;
  details: unknown;
}) {
  return prisma.reviewReport.create({
    data: {
      projectId: input.projectId,
      workflowType: input.workflowType,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      scoresJson: stringifyJson(input.scores ?? {}),
      detailsJson: stringifyJson(input.details),
    },
  });
}

export function compactErrorMessage(error: unknown, maxLength = 300) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > maxLength ? `${message.slice(0, maxLength)}...` : message;
}
