"use client";

import { useCallback, useEffect, useState } from "react";
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
  initialJob,
}: {
  jobId?: string;
  projectId: string;
  tab: string;
  focusSceneId?: string;
  initialJob?: JobState;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobState | null>(initialJob ?? null);
  const [isStaleRunning, setIsStaleRunning] = useState(false);
  const [manualRefreshJobId, setManualRefreshJobId] = useState<string | null>(null);
  const [pollError, setPollError] = useState<{ jobId: string; message: string } | null>(null);
  const needsManualRefresh = manualRefreshJobId === jobId;

  const refreshResults = useCallback(() => {
    if (!jobId) return;
    sessionStorage.setItem(refreshedJobKey(jobId), "true");
    setManualRefreshJobId(null);
    router.refresh();
  }, [jobId, router]);

  useEffect(() => {
    if (!jobId) return;
    const currentJobId = jobId;
    let stopped = false;

    async function tick() {
      try {
        const response = await fetch(`/api/jobs/${currentJobId}`, { cache: "no-store" });
        if (stopped) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const nextJob = (await response.json()) as JobState;
        setJob(nextJob);
        setPollError(null);
        setIsStaleRunning(
          nextJob.status === "running" &&
            Boolean(nextJob.startedAt) &&
            Date.now() - new Date(nextJob.startedAt as string).getTime() > 5 * 60 * 1000,
        );
        if (nextJob.status === "success" || nextJob.status === "failed") {
          stopped = true;
          clearInterval(timer);

          if (nextJob.status !== "success") return;
          if (sessionStorage.getItem(refreshedJobKey(currentJobId)) === "true") return;
          setManualRefreshJobId(currentJobId);
        }
      } catch (error) {
        if (stopped) return;
        const message = error instanceof Error ? error.message : String(error);
        setPollError({ jobId: currentJobId, message: `任务状态刷新失败：${message}` });
      }
    }

    const timer = setInterval(tick, 1800);
    void tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [jobId, initialJob, refreshResults]);

  if (!jobId) return null;

  const displayedJob = job?.id === jobId ? job : initialJob ?? null;
  const displayedPollError = pollError?.jobId === jobId ? pollError.message : "";
  const displayRuns = compactRuns(displayedJob?.latestRuns ?? []);
  const status = displayedJob?.status ?? "loading";
  const isSuccess = status === "success";
  const isFailed = status === "failed";
  const meta = displayedJob?.type ? workflowMeta[displayedJob.type as LocalJobType] : undefined;
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
          {meta?.label ?? displayedJob?.type ?? "任务"}：{statusText}
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
        {needsManualRefresh ? (
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-80">任务已结束。为避免打断编辑，不会自动刷新页面。</span>
            <button
              type="button"
              onClick={refreshResults}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-950"
            >
              手动刷新结果
            </button>
          </div>
        ) : null}
      </div>

      {displayRuns.length ? (
        <div className="mt-3 grid gap-1 text-xs">
          {displayRuns.map((run) => (
            <div key={run.agentName} className="flex flex-wrap gap-2">
              <span className="font-medium">{run.agentName}</span>
              <span>{readableRunStatus(run.status)}</span>
              <span>{formatRunDuration(run)}</span>
              {run.error ? <span className="text-rose-700">{run.error}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {displayedPollError ? <p className="mt-2 text-amber-800">{displayedPollError}</p> : null}
      {displayedJob?.error ? <p className="mt-2 text-rose-700">{displayedJob.error}</p> : null}
    </div>
  );
}

function refreshedJobKey(jobId: string) {
  return `novel-writer:job-refreshed:${jobId}`;
}

function compactRuns(runs: AgentRunState[]) {
  const byAgent = new Map<string, AgentRunState>();
  for (const run of runs) {
    byAgent.set(run.agentName, run);
  }
  return Array.from(byAgent.values());
}

function readableRunStatus(status: string) {
  if (status === "success") return "完成";
  if (status === "failed") return "失败";
  if (status === "running") return "请求中";
  return status;
}

function formatRunDuration(run: AgentRunState) {
  const durationMs =
    run.durationMs ?? (run.status === "running" ? Date.now() - new Date(run.createdAt).getTime() : 0);
  if (!durationMs || durationMs < 0) return "刚开始";
  return `${Math.max(1, Math.round(durationMs / 1000))} 秒`;
}
