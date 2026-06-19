"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RotateCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { retryWorkflowAction } from "@/app/actions/workflows";
import { SubmitButton } from "@/components/form/SubmitButton";
import type { LocalJobType } from "@/lib/jobs/runner";
import { workflowMeta } from "@/lib/storyWorkflow";
import { cn } from "@/lib/utils";

type AgentRunState = {
  agentName: string;
  status: string;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
};

type JobState = {
  id: string;
  projectId: string | null;
  type: string;
  status: string;
  error: string | null;
  attempts: number;
  startedAt: string | null;
  latestRuns?: AgentRunState[];
};

export function JobWatcher({
  jobId,
  projectId,
  tab,
  focusSceneId,
}: {
  jobId?: string;
  projectId: string;
  tab: string;
  focusSceneId?: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobState | null>(null);
  const [isStaleRunning, setIsStaleRunning] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;

    async function tick() {
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!response.ok || stopped) return;
      const nextJob = (await response.json()) as JobState;
      setJob(nextJob);
      setIsStaleRunning(
        nextJob.status === "running" &&
          Boolean(nextJob.startedAt) &&
          Date.now() - new Date(nextJob.startedAt as string).getTime() > 5 * 60 * 1000,
      );
      if (nextJob.status === "success" || nextJob.status === "failed") {
        router.refresh();
      }
    }

    void tick();
    const timer = setInterval(tick, 1800);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [jobId, router]);

  if (!jobId) return null;

  const displayRuns = compactRuns(job?.latestRuns ?? []);
  const status = job?.status ?? "loading";
  const isSuccess = status === "success";
  const isFailed = status === "failed";
  const meta = job?.type ? workflowMeta[job.type as LocalJobType] : undefined;
  const statusText =
    status === "success"
      ? "已完成"
      : status === "failed"
        ? "失败"
        : status === "running"
          ? "运行中"
          : status === "pending"
            ? "排队中"
            : "加载中";

  return (
    <div
      className={cn(
        "mb-4 rounded-lg border px-4 py-3 text-sm",
        isSuccess && "border-emerald-200 bg-emerald-50 text-emerald-950",
        isFailed && "border-rose-200 bg-rose-50 text-rose-950",
        !isSuccess && !isFailed && "border-amber-200 bg-amber-50 text-amber-950",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {status === "running" || status === "loading" ? (
            <RotateCw className="h-4 w-4 animate-spin" />
          ) : isSuccess ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <span className="font-medium">
            {meta?.label ?? job?.type ?? "任务"}：{statusText}
          </span>
          {meta ? <span className="text-xs opacity-80">({meta.scope})</span> : null}
        </div>
        {isFailed || isStaleRunning ? (
          <form action={retryWorkflowAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="jobId" value={jobId} />
            {focusSceneId ? <input type="hidden" name="focusSceneId" value={focusSceneId} /> : null}
            <SubmitButton variant="outline" pendingText="重跑中">
              {isFailed ? "重跑失败任务" : "重新运行任务"}
            </SubmitButton>
          </form>
        ) : null}
      </div>

      {displayRuns.length ? (
        <div className="mt-3 grid gap-1 text-xs">
          {displayRuns.map((run) => (
            <div key={run.agentName} className="flex flex-wrap gap-2">
              <span className="font-medium">{run.agentName}</span>
              <span>{run.status === "success" ? "完成" : run.status === "failed" ? "失败" : run.status}</span>
              {run.durationMs ? <span>{Math.round(run.durationMs / 1000)} 秒</span> : null}
              {run.error ? <span className="text-rose-700">{run.error}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {job?.error ? <p className="mt-2 text-rose-700">{job.error}</p> : null}
    </div>
  );
}

function compactRuns(runs: AgentRunState[]) {
  const byAgent = new Map<string, AgentRunState>();
  for (const run of runs) {
    byAgent.set(run.agentName, run);
  }
  return Array.from(byAgent.values());
}
