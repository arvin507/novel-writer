"use server";

import { redirect } from "next/navigation";
import { enqueueLocalJob, retryLocalJob, type LocalJobType } from "@/lib/jobs/runner";

export async function startWorkflowAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const type = String(formData.get("type") || "") as LocalJobType;
  const tab = String(formData.get("tab") || "overview");
  const sceneCardId = String(formData.get("sceneCardId") || "");
  const focusSceneId = String(formData.get("focusSceneId") || "");
  const job = await enqueueLocalJob({
    type,
    projectId,
    payload: sceneCardId ? { sceneCardId } : {},
  });
  const params = new URLSearchParams({ tab, jobId: job.id });
  if (focusSceneId) params.set("sceneId", focusSceneId);
  redirect(`/projects/${projectId}?${params.toString()}`);
}

export async function retryWorkflowAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const tab = String(formData.get("tab") || "overview");
  const jobId = String(formData.get("jobId") || "");
  const focusSceneId = String(formData.get("focusSceneId") || "");
  const job = await retryLocalJob(jobId);
  const params = new URLSearchParams({ tab, jobId: job.id });
  if (focusSceneId) params.set("sceneId", focusSceneId);
  redirect(`/projects/${projectId}?${params.toString()}`);
}
