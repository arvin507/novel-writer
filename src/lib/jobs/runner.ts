import { prisma } from "@/db/prisma";
import { generateHooks } from "@/agents/workflows/generateHooks";
import { generateOutline, reviseOutline } from "@/agents/workflows/generateOutline";
import { generateStoryDirections } from "@/agents/workflows/generateStoryDirections";
import { polishFinalDraft } from "@/agents/workflows/polishFinalDraft";
import { reviewDraft } from "@/agents/workflows/reviewDraft";
import { reviseHooks } from "@/agents/workflows/reviseHooks";
import { writeScene } from "@/agents/workflows/writeScene";
import { safeJsonParse, stringifyJson } from "@/lib/utils";

export type LocalJobType =
  | "generate_story_directions"
  | "generate_hooks"
  | "revise_hooks"
  | "generate_outline"
  | "revise_outline"
  | "write_scene"
  | "revise_scene"
  | "review_draft"
  | "polish_final_draft";

const runningJobs = new Set<string>();

export async function enqueueLocalJob(input: {
  type: LocalJobType;
  projectId?: string;
  payload?: Record<string, unknown>;
}) {
  const job = await prisma.localJob.create({
    data: {
      type: input.type,
      projectId: input.projectId,
      payloadJson: stringifyJson(input.payload ?? {}),
      status: "pending",
    },
  });

  scheduleJob(job.id);
  return job;
}

export function scheduleJob(jobId: string) {
  setTimeout(() => {
    void runLocalJob(jobId);
  }, 0);
}

export async function retryLocalJob(jobId: string) {
  const job = await prisma.localJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      error: null,
      resultJson: null,
      startedAt: null,
      finishedAt: null,
    },
  });
  scheduleJob(job.id);
  return job;
}

export async function runLocalJob(jobId: string) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    const job = await prisma.localJob.findUnique({ where: { id: jobId } });
    if (!job || (job.status !== "pending" && job.status !== "failed")) return;

    await prisma.localJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        attempts: { increment: 1 },
        startedAt: new Date(),
        error: null,
      },
    });

    const result = await executeJob(job.type as LocalJobType, job.projectId, job.payloadJson);

    await prisma.localJob.update({
      where: { id: jobId },
      data: {
        status: "success",
        resultJson: stringifyJson(result),
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.localJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    });
  } finally {
    runningJobs.delete(jobId);
  }
}

async function executeJob(type: LocalJobType, projectId: string | null, payloadJson: string) {
  const payload = safeJsonParse<Record<string, string>>(payloadJson, {});
  if (!projectId) throw new Error("任务缺少 projectId。");

  switch (type) {
    case "generate_story_directions":
      return generateStoryDirections(projectId);
    case "generate_hooks":
      return generateHooks(projectId);
    case "revise_hooks":
      return reviseHooks(projectId);
    case "generate_outline":
      return generateOutline(projectId);
    case "revise_outline":
      return reviseOutline(projectId);
    case "write_scene":
      if (!payload.sceneCardId) throw new Error("写场景任务缺少 sceneCardId。");
      return writeScene(projectId, payload.sceneCardId);
    case "revise_scene":
      if (!payload.sceneCardId) throw new Error("修订场景任务缺少 sceneCardId。");
      return writeScene(projectId, payload.sceneCardId, "revise_scene");
    case "review_draft":
      return reviewDraft(projectId);
    case "polish_final_draft":
      return polishFinalDraft(projectId);
    default:
      throw new Error(`未知任务类型：${type}`);
  }
}
