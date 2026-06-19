"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exportProject, type ExportType } from "@/lib/export/exporters";

export async function exportProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId") || "");
  const type = String(formData.get("type") || "") as ExportType;
  const exported = await exportProject(projectId, type);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?tab=export&exportId=${exported.id}`);
}
