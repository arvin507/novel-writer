import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";

const staleRunningJobMs = 30 * 60 * 1000;
const jobSelect = {
  id: true,
  projectId: true,
  type: true,
  status: true,
  error: true,
  attempts: true,
  resultJson: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  updatedAt: true,
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let job = await prisma.localJob.findUnique({
    where: { id },
    select: jobSelect,
  });

  if (!job) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  if (
    job.status === "running" &&
    job.startedAt &&
    Date.now() - job.startedAt.getTime() > staleRunningJobMs
  ) {
    job = await prisma.localJob.update({
      where: { id },
      data: {
        status: "failed",
        error: "任务运行时间过长，可能已被本地服务重启中断，请重新运行任务。",
        finishedAt: new Date(),
      },
      select: jobSelect,
    });
  }

  const latestRuns = job.projectId
    ? await prisma.agentRun.findMany({
        where: {
          projectId: job.projectId,
          workflowType: job.type,
          createdAt: { gte: job.createdAt },
        },
        orderBy: { createdAt: "asc" },
        select: {
          agentName: true,
          status: true,
          error: true,
          durationMs: true,
          createdAt: true,
        },
      })
    : [];

  return NextResponse.json({ ...job, latestRuns });
}
