"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { DEFAULT_PLATFORM_KEY, isSupportedPlatform } from "@/lib/platforms";
import { countCjkWords, stringifyJson } from "@/lib/utils";

const projectSchema = z.object({
  title: z.string().trim().optional().default(""),
  genre: z.string().trim().min(1, "故事类型必填"),
  keywords: z.string().default(""),
  targetWordCount: z.coerce.number().min(6000, "短篇目标字数至少 6000 字").default(8000),
  targetPlatform: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : DEFAULT_PLATFORM_KEY),
    z.string().refine(isSupportedPlatform, "目标平台无效"),
  ),
  platformRequirementOverride: z.string().trim().default(""),
  pov: z.string().trim().default("第一人称"),
  endingPreference: z.string().trim().default("反转后释然"),
  emotionalTone: z.string().trim().default("强冲突"),
  originalIdea: z.string().trim().min(1, "原始灵感必填：先写一句故事灵感。"),
  forbiddenItems: z.string().default(""),
});

const createProjectSchema = projectSchema.extend({
  timeSpace: z.string().trim().optional().default(""),
  protagonistProfile: z.string().trim().optional().default(""),
  relationshipCore: z.string().trim().optional().default(""),
  plotPromise: z.string().trim().optional().default(""),
  presetTags: z.string().trim().optional().default(""),
});

function projectValidationMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join("；");
  }
  return error instanceof Error ? error.message : String(error);
}

function redirectToNewProjectError(error: unknown): never {
  redirect(`/projects/new?error=${encodeURIComponent(projectValidationMessage(error))}`);
}

function redirectToProjectSettingsError(projectId: string, error: unknown): never {
  redirect(
    `/projects/${projectId}?tab=settings&error=${encodeURIComponent(projectValidationMessage(error))}`,
  );
}

export async function createProjectAction(formData: FormData) {
  const result = createProjectSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    redirectToNewProjectError(result.error);
  }

  const parsed = result.data;
  const title =
    parsed.title.trim() ||
    parsed.originalIdea.trim().slice(0, 24) ||
    `${parsed.genre}故事`;

  const enrichedIdea = buildOriginalIdea(parsed);
  const enrichedKeywords = [parsed.keywords, parsed.timeSpace, parsed.protagonistProfile, parsed.relationshipCore, parsed.plotPromise, parsed.presetTags]
    .filter(Boolean)
    .join("；");

  const project = await prisma.project.create({
    data: {
      title,
      genre: parsed.genre,
      keywords: enrichedKeywords,
      targetWordCount: parsed.targetWordCount,
      targetPlatform: parsed.targetPlatform,
      platformRequirementOverride: parsed.platformRequirementOverride,
      pov: parsed.pov,
      endingPreference: parsed.endingPreference,
      emotionalTone: parsed.emotionalTone,
      originalIdea: enrichedIdea,
      forbiddenItems: parsed.forbiddenItems,
    },
  });

  redirect(`/projects/${project.id}`);
}

function buildOriginalIdea(input: z.infer<typeof createProjectSchema>) {
  return [
    input.originalIdea,
    input.timeSpace ? `时空背景：${input.timeSpace}` : "",
    input.protagonistProfile ? `人物预设：${input.protagonistProfile}` : "",
    input.relationshipCore ? `关系/冲突：${input.relationshipCore}` : "",
    input.plotPromise ? `读者承诺：${input.plotPromise}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function updateProjectAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const result = projectSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    redirectToProjectSettingsError(id, result.error);
  }

  const parsed = result.data;
  await prisma.project.update({
    where: { id },
    data: {
      title: parsed.title || parsed.originalIdea.slice(0, 24),
      genre: parsed.genre,
      keywords: parsed.keywords,
      targetWordCount: parsed.targetWordCount,
      targetPlatform: parsed.targetPlatform,
      platformRequirementOverride: parsed.platformRequirementOverride,
      pov: parsed.pov,
      endingPreference: parsed.endingPreference,
      emotionalTone: parsed.emotionalTone,
      originalIdea: parsed.originalIdea,
      forbiddenItems: parsed.forbiddenItems,
    },
  });
  revalidatePath(`/projects/${id}`);
}

export async function archiveProjectAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await prisma.project.update({
    where: { id },
    data: { archivedAt: new Date(), currentStage: "archived" },
  });
  revalidatePath("/dashboard");
}

export async function restoreProjectAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await prisma.project.update({
    where: { id },
    data: { archivedAt: null, currentStage: "restored" },
  });
  revalidatePath("/dashboard");
}

export async function deleteProjectAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  await prisma.project.delete({ where: { id } });
  revalidatePath("/dashboard");
}

export async function selectDirectionAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const directionId = String(formData.get("directionId") || "");
  await prisma.storyDirection.updateMany({
    where: { projectId },
    data: { selected: false },
  });
  await prisma.storyDirection.update({
    where: { id: directionId },
    data: { selected: true },
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { selectedDirectionId: directionId },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateStoryDirectionAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const projectId = String(formData.get("projectId") || "");
  await prisma.storyDirection.update({
    where: { id },
    data: {
      title: String(formData.get("title") || ""),
      logline: String(formData.get("logline") || ""),
      openingHook: String(formData.get("openingHook") || ""),
      coreConflict: String(formData.get("coreConflict") || ""),
      protagonistDilemma: String(formData.get("protagonistDilemma") || ""),
      mainTwist: String(formData.get("mainTwist") || ""),
      emotionalValue: String(formData.get("emotionalValue") || ""),
      targetReaders: String(formData.get("targetReaders") || ""),
      commercialScore: Number(formData.get("commercialScore") || 0),
      risk: String(formData.get("risk") || ""),
      recommendationReason: String(formData.get("recommendationReason") || ""),
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateHookPackageAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const projectId = String(formData.get("projectId") || "");
  await prisma.hookPackage.update({
    where: { id },
    data: {
      selectedTitle: String(formData.get("selectedTitle") || ""),
      selectedLogline: String(formData.get("selectedLogline") || ""),
      selectedHook: String(formData.get("selectedHook") || ""),
      titlesJson: String(formData.get("titlesJson") || "[]"),
      loglinesJson: String(formData.get("loglinesJson") || "[]"),
      openingHooksJson: String(formData.get("openingHooksJson") || "[]"),
      openingSamplesJson: String(formData.get("openingSamplesJson") || "[]"),
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateCharacterAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const projectId = String(formData.get("projectId") || "");
  await prisma.character.update({
    where: { id },
    data: {
      name: String(formData.get("name") || ""),
      role: String(formData.get("role") || ""),
      identity: String(formData.get("identity") || ""),
      surfaceGoal: String(formData.get("surfaceGoal") || ""),
      trueDesire: String(formData.get("trueDesire") || ""),
      weakness: String(formData.get("weakness") || ""),
      secret: String(formData.get("secret") || ""),
      relationshipToProtagonist: String(formData.get("relationshipToProtagonist") || ""),
      plotFunction: String(formData.get("plotFunction") || ""),
      turningPoint: String(formData.get("turningPoint") || ""),
      ending: String(formData.get("ending") || ""),
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateSceneCardAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const projectId = String(formData.get("projectId") || "");
  await prisma.sceneCard.update({
    where: { id },
    data: {
      title: String(formData.get("title") || ""),
      goal: String(formData.get("goal") || ""),
      location: String(formData.get("location") || ""),
      conflict: String(formData.get("conflict") || ""),
      informationGain: String(formData.get("informationGain") || ""),
      emotionalShift: String(formData.get("emotionalShift") || ""),
      payoff: String(formData.get("payoff") || ""),
      status: String(formData.get("status") || "unwritten"),
      mustIncludeJson: String(formData.get("mustIncludeJson") || "[]"),
      foreshadowingJson: String(formData.get("foreshadowingJson") || "[]"),
      forbiddenJson: String(formData.get("forbiddenJson") || "[]"),
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateDraftSegmentAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  const projectId = String(formData.get("projectId") || "");
  const content = String(formData.get("content") || "");
  const segment = await prisma.draftSegment.update({
    where: { id },
    data: {
      title: String(formData.get("title") || ""),
      content,
      status: String(formData.get("status") || "draft"),
      wordCount: countCjkWords(content),
    },
  });
  await prisma.draftVersion.create({
    data: {
      segmentId: segment.id,
      content,
      reason: "手动保存",
      createdByAgent: "User",
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function rollbackDraftVersionAction(formData: FormData) {
  const versionId = String(formData.get("versionId") || "");
  const projectId = String(formData.get("projectId") || "");
  const version = await prisma.draftVersion.findUnique({
    where: { id: versionId },
    include: { segment: true },
  });
  if (!version) throw new Error("版本不存在。");
  await prisma.draftSegment.update({
    where: { id: version.segmentId },
    data: {
      content: version.content,
      wordCount: countCjkWords(version.content),
      status: "needs_revision",
    },
  });
  await prisma.draftVersion.create({
    data: {
      segmentId: version.segmentId,
      content: version.content,
      reason: `回滚到 ${version.createdAt.toISOString()}`,
      createdByAgent: "User",
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function saveStoryBibleAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  await prisma.storyBible.upsert({
    where: { projectId },
    update: {
      previousSummary: String(formData.get("previousSummary") || ""),
      happenedEvents: String(formData.get("happenedEvents") || "[]"),
      revealedSecrets: String(formData.get("revealedSecrets") || "[]"),
      unrevealedSecrets: String(formData.get("unrevealedSecrets") || "[]"),
      openForeshadowing: String(formData.get("openForeshadowing") || "[]"),
      resolvedForeshadowing: String(formData.get("resolvedForeshadowing") || "[]"),
      characterStates: String(formData.get("characterStates") || "{}"),
      timeline: String(formData.get("timeline") || "[]"),
      rawJson: stringifyJson({ editedBy: "user" }),
    },
    create: {
      projectId,
      previousSummary: String(formData.get("previousSummary") || ""),
      happenedEvents: String(formData.get("happenedEvents") || "[]"),
      revealedSecrets: String(formData.get("revealedSecrets") || "[]"),
      unrevealedSecrets: String(formData.get("unrevealedSecrets") || "[]"),
      openForeshadowing: String(formData.get("openForeshadowing") || "[]"),
      resolvedForeshadowing: String(formData.get("resolvedForeshadowing") || "[]"),
      characterStates: String(formData.get("characterStates") || "{}"),
      timeline: String(formData.get("timeline") || "[]"),
      rawJson: stringifyJson({ editedBy: "user" }),
    },
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { previousSummary: String(formData.get("previousSummary") || "") },
  });
  revalidatePath(`/projects/${projectId}`);
}
