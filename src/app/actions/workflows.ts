"use server";

import { redirect } from "next/navigation";
import { enqueueLocalJob, retryLocalJob, type LocalJobType } from "@/lib/jobs/runner";

export async function startWorkflowAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const type = String(formData.get("type") || "") as LocalJobType;
  const tab = String(formData.get("tab") || "overview");
  const sceneCardId = String(formData.get("sceneCardId") || "");
  const job = await enqueueLocalJob({
    type,
    projectId,
    payload: sceneCardId ? { sceneCardId } : {},
  });
  redirect(`/projects/${projectId}?tab=${tab}&jobId=${job.id}`);
}

export async function retryWorkflowAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const tab = String(formData.get("tab") || "overview");
  const jobId = String(formData.get("jobId") || "");
  const job = await retryLocalJob(jobId);
  redirect(`/projects/${projectId}?tab=${tab}&jobId=${job.id}`);
}
