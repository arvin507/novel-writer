import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpenCheck,
  CheckCircle2,
  Compass,
  Download,
  FileText,
  GitCompare,
  Info,
  ListChecks,
  PanelLeft,
  PenLine,
  Play,
  ScrollText,
  Target,
  Users,
} from "lucide-react";
import {
  rollbackDraftVersionAction,
  saveStoryBibleAction,
  selectDirectionAction,
  updateCharacterAction,
  updateDraftSegmentAction,
  updateHookPackageAction,
  updateProjectAction,
  updateSceneCardAction,
  updateStoryDirectionAction,
} from "@/app/actions/projects";
import { exportProjectAction } from "@/app/actions/exports";
import { startWorkflowAction } from "@/app/actions/workflows";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/form/SubmitButton";
import { JobWatcher } from "@/components/JobWatcher";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { PreserveScrollLink } from "@/components/PreserveScrollLink";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/db/prisma";
import { buildWordDiff } from "@/lib/diff/textDiff";
import type { LocalJobType } from "@/lib/jobs/runner";
import { DEFAULT_PLATFORM_KEY, getPlatformProfile, platformProfiles } from "@/lib/platforms";
import { scoreHints } from "@/lib/scoring/storyScoring";
import {
  projectMilestones,
  readableChiefAction,
  readableSceneStatus,
  readableStage,
  workflowMeta,
} from "@/lib/storyWorkflow";
import { cn, formatDate, safeJsonParse } from "@/lib/utils";

const tabs = [
  ["overview", "总览"],
  ["directions", "故事方向"],
  ["hooks", "标题钩子"],
  ["characters", "人物设定"],
  ["outline", "大纲结构"],
  ["scenes", "场景卡片"],
  ["writing", "正文写作"],
  ["reviews", "全文审稿"],
  ["versions", "版本历史"],
  ["export", "导出"],
  ["settings", "设置"],
] as const;

const selectClassName = "h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm";

const tabGroups = [
  { label: "规划", items: [tabs[0], tabs[1], tabs[2], tabs[3], tabs[4]] },
  { label: "创作", items: [tabs[5], tabs[6], tabs[7], tabs[8]] },
  { label: "交付", items: [tabs[9], tabs[10]] },
];

async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      storyDirections: { orderBy: { createdAt: "asc" } },
      hookPackages: { orderBy: { createdAt: "desc" } },
      characters: { orderBy: { createdAt: "asc" } },
      outlines: { orderBy: { createdAt: "desc" } },
      sceneCards: { orderBy: { orderIndex: "asc" } },
      draftSegments: {
        orderBy: { createdAt: "asc" },
        include: { versions: { orderBy: { createdAt: "desc" } }, sceneCard: true },
      },
      reviewReports: { orderBy: { createdAt: "desc" }, take: 20 },
      // Keep full Agent output off the main detail query; long drafts make these rows large.
      agentRuns: {
        orderBy: { createdAt: "desc" },
        take: 60,
        select: {
          id: true,
          projectId: true,
          workflowType: true,
          agentName: true,
          status: true,
          error: true,
          durationMs: true,
          createdAt: true,
        },
      },
      storyBible: true,
      foreshadowings: true,
      twists: true,
      exportFiles: { orderBy: { createdAt: "desc" } },
      localJobs: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}

type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type StoryDirectionItem = ProjectDetail["storyDirections"][number];
type CharacterItem = ProjectDetail["characters"][number];
type SceneCardItem = ProjectDetail["sceneCards"][number];
type DraftSegmentItem = ProjectDetail["draftSegments"][number];
type ChiefDecision = {
  overallScore?: number;
  summary?: string;
  coreProblems?: string[];
  acceptedSuggestions?: string[];
  rejectedSuggestions?: string[];
  rewriteInstructions?: string[];
  nextAction?: string;
  reason?: string;
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    tab?: string;
    jobId?: string;
    diff?: string;
    exportId?: string;
    error?: string;
    sceneId?: string;
    segmentId?: string;
    directionId?: string;
    characterId?: string;
  }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const project = await getProject(id);
  if (!project) notFound();

  const activeTab = tabs.some(([key]) => key === query.tab) ? query.tab ?? "overview" : "overview";
  const latestJob = project.localJobs[0];
  const fallbackJobId = latestJob && latestJob.status !== "success" ? latestJob.id : undefined;
  const watchedJobId = query.jobId ?? fallbackJobId;
  const initialWatchedJob = watchedJobId
    ? project.localJobs.find((job) => job.id === watchedJobId)
    : undefined;
  const initialWatchedRuns = initialWatchedJob
    ? project.agentRuns
        .filter(
          (run) =>
            run.workflowType === initialWatchedJob.type &&
            run.createdAt.getTime() >= initialWatchedJob.createdAt.getTime(),
        )
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((run) => ({
          agentName: run.agentName,
          status: run.status,
          error: run.error,
          durationMs: run.durationMs,
          createdAt: run.createdAt.toISOString(),
        }))
    : [];
  const initialJobState = initialWatchedJob
    ? {
        id: initialWatchedJob.id,
        projectId: initialWatchedJob.projectId,
        type: initialWatchedJob.type,
        status: initialWatchedJob.status,
        error: initialWatchedJob.error,
        attempts: initialWatchedJob.attempts,
        startedAt: initialWatchedJob.startedAt?.toISOString() ?? null,
        latestRuns: initialWatchedRuns,
      }
    : undefined;
  const totalWords = project.draftSegments.reduce((sum, item) => sum + item.wordCount, 0);
  const platformProfile = getPlatformProfile(project.targetPlatform);
  const writtenScenes = project.sceneCards.filter((scene) =>
    project.draftSegments.some((segment) => segment.sceneCardId === scene.id),
  ).length;
  const progress = project.targetWordCount
    ? Math.min(100, Math.round((totalWords / project.targetWordCount) * 100))
    : 0;
  const compactWorkspace = ["directions", "characters", "scenes", "writing"].includes(activeTab);

  return (
    <main className="mx-auto max-w-7xl px-4 py-5 sm:px-5 lg:py-6">
      <section className="mb-3 overflow-hidden rounded-lg border border-zinc-200/80 bg-white/92 shadow-sm shadow-zinc-200/70">
        <div
          className={cn(
            "grid gap-4 border-b border-zinc-100 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-start",
            compactWorkspace && "py-3",
          )}
        >
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link className="text-sm text-zinc-500 hover:text-zinc-900" href="/dashboard">
                项目
              </Link>
              <span className="text-zinc-300">/</span>
              <Badge className="border-teal-200 bg-teal-50 text-teal-900">{readableStage(project.currentStage)}</Badge>
              <Badge className="border-sky-200 bg-sky-50 text-sky-900">{platformProfile.shortLabel}</Badge>
              <Badge>{project.genre}</Badge>
            </div>
            <h1 className="truncate text-xl font-semibold text-zinc-950 sm:text-2xl">{project.title}</h1>
            {compactWorkspace ? null : (
              <p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-600">{project.originalIdea}</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Metric label="目标字数" value={project.targetWordCount.toString()} />
            <Metric label="当前字数" value={totalWords.toString()} />
            <Metric label="已写场景" value={`${writtenScenes}/${project.sceneCards.length || 0}`} />
          </div>
        </div>
        <div className={cn("px-4 py-3", compactWorkspace && "py-2")}>
          <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", !compactWorkspace && "mb-3")}>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                <span>正文进度</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-teal-700" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <Badge className="w-fit border-zinc-200 bg-white text-zinc-700">当前：{readableStage(project.currentStage)}</Badge>
          </div>
          {compactWorkspace ? null : <StageRail project={project} activeTab={activeTab} />}
        </div>
      </section>

      <ProjectTabs projectId={project.id} activeTab={activeTab} />

      {activeTab === "overview" ? (
        <div className="mb-4">
          <NextBestActions project={project} />
        </div>
      ) : null}

      {query.error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {query.error}
        </div>
      ) : null}

      <JobWatcher
        jobId={watchedJobId}
        projectId={project.id}
        tab={activeTab}
        focusSceneId={query.sceneId}
        initialJob={initialJobState}
      />

      {activeTab === "overview" ? <Overview project={project} totalWords={totalWords} /> : null}
      {activeTab === "directions" ? <Directions project={project} selectedDirectionId={query.directionId} /> : null}
      {activeTab === "hooks" ? <Hooks project={project} /> : null}
      {activeTab === "characters" ? <Characters project={project} selectedCharacterId={query.characterId} /> : null}
      {activeTab === "outline" ? <Outline project={project} /> : null}
      {activeTab === "scenes" ? <Scenes project={project} selectedSceneId={query.sceneId} /> : null}
      {activeTab === "writing" ? (
        <Writing project={project} selectedSceneId={query.sceneId} selectedSegmentId={query.segmentId} />
      ) : null}
      {activeTab === "reviews" ? <Reviews project={project} /> : null}
      {activeTab === "versions" ? <Versions project={project} diffId={query.diff} /> : null}
      {activeTab === "export" ? <Export project={project} exportId={query.exportId} /> : null}
      {activeTab === "settings" ? <ProjectSettings project={project} /> : null}
    </main>
  );
}

function ProjectTabs({ projectId, activeTab }: { projectId: string; activeTab: string }) {
  return (
    <nav className="sticky top-2 z-10 mb-4 flex gap-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white/94 p-1.5 shadow-sm shadow-zinc-200/70 backdrop-blur">
      {tabGroups.map((group) => (
        <div key={group.label} className="flex shrink-0 items-center gap-1 rounded-md bg-zinc-50/80 p-1">
          <span className="px-2 text-[11px] font-medium text-zinc-400">{group.label}</span>
          {group.items.map(([key, label]) => (
            <Link
              key={key}
              href={`/projects/${projectId}?tab=${key}`}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-white hover:text-zinc-950",
                activeTab === key && "bg-zinc-950 text-white shadow-sm hover:bg-zinc-950 hover:text-white",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

function StageRail({ project, activeTab }: { project: ProjectDetail; activeTab: string }) {
  const completed = new Set<string>();
  if (project.storyDirections.length) completed.add("directions");
  if (project.hookPackages.length) completed.add("hooks");
  if (project.characters.length) completed.add("characters");
  if (project.outlines.length) completed.add("outline");
  if (project.draftSegments.length) completed.add("writing");
  if (project.reviewReports.some((report) => report.workflowType === "review_draft")) completed.add("reviews");
  if (project.exportFiles.length) completed.add("export");

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {projectMilestones.map((milestone) => {
        const Icon = milestone.icon;
        const done = completed.has(milestone.key);
        const active = activeTab === milestone.key;
        return (
          <Link
            key={milestone.key}
            href={`/projects/${project.id}?tab=${milestone.key}`}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
              done && "border-teal-200 bg-teal-50 text-teal-950",
              active && "border-zinc-950 bg-zinc-950 text-white",
              !done && !active && "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-white",
            )}
          >
            {done && !active ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
            <span className="truncate">{milestone.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function NextBestActions({ project }: { project: ProjectDetail }) {
  const nextScene = project.sceneCards.find(
    (scene) => !project.draftSegments.some((segment) => segment.sceneCardId === scene.id),
  );
  const actions: Array<{ type: LocalJobType; tab: string; sceneCardId?: string; reason: string }> = [];

  if (!project.storyDirections.length) {
    actions.push({
      type: "generate_story_directions",
      tab: "directions",
      reason: "先把灵感扩展成多个可选故事方向。",
    });
  } else if (!project.hookPackages.length) {
    actions.push({
      type: "generate_hooks",
      tab: "hooks",
      reason: "方向已有，下一步包装标题、简介和开篇钩子。",
    });
  } else if (!project.outlines.length || !project.sceneCards.length) {
    actions.push({
      type: "generate_outline",
      tab: "outline",
      reason: "继续生成人物、大纲、伏笔和可写的场景卡。",
    });
  } else if (nextScene) {
    actions.push({
      type: "write_scene",
      tab: "writing",
      sceneCardId: nextScene.id,
      reason: `继续写第 ${nextScene.orderIndex} 场：${nextScene.title}`,
    });
  } else if (!project.reviewReports.some((report) => report.workflowType === "review_draft")) {
    actions.push({
      type: "review_draft",
      tab: "reviews",
      reason: "所有场景已有正文，进入全文完稿审稿。",
    });
  } else {
    actions.push({
      type: "polish_final_draft",
      tab: "reviews",
      reason: "审稿完成后生成全文最终润色稿。",
    });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {actions.map((action) => {
        const meta = workflowMeta[action.type];
        const Icon = meta.icon;
        return (
          <Card key={`${action.type}-${action.sceneCardId ?? ""}`} className="border-teal-200 bg-teal-50/70">
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-teal-950">建议下一步：{meta.label}</div>
                  <p className="mt-1 text-sm text-teal-900">{action.reason}</p>
                </div>
              </div>
              <WorkflowButton projectId={project.id} type={action.type} tab={action.tab} sceneCardId={action.sceneCardId}>
                开始
              </WorkflowButton>
            </CardContent>
          </Card>
        );
      })}
      <Card>
        <CardContent className="flex items-start gap-3 text-sm leading-6 text-zinc-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <div>
            <div className="font-medium text-zinc-900">审稿/润色处理的是全文</div>
            <p>“全文完稿审稿”会读取所有已写场景；“全文最终润色”会基于整篇正文生成润色稿，不是只处理单个场景。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="text-sm font-semibold text-zinc-950">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function WorkflowButton({
  projectId,
  type,
  tab,
  sceneCardId,
  focusSceneId,
  children,
}: {
  projectId: string;
  type: LocalJobType;
  tab: string;
  sceneCardId?: string;
  focusSceneId?: string;
  children: React.ReactNode;
}) {
  const meta = workflowMeta[type];
  const targetSceneId = focusSceneId ?? sceneCardId;
  return (
    <form action={startWorkflowAction} title={`${meta.label}：${meta.description}`}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="tab" value={tab} />
      {sceneCardId ? <input type="hidden" name="sceneCardId" value={sceneCardId} /> : null}
      {targetSceneId ? <input type="hidden" name="focusSceneId" value={targetSceneId} /> : null}
      <SubmitButton pendingText="启动中" variant="secondary">
        <Play className="h-4 w-4" />
        {children}
      </SubmitButton>
    </form>
  );
}

function WorkflowCard({
  projectId,
  type,
  tab,
  sceneCardId,
}: {
  projectId: string;
  type: LocalJobType;
  tab: string;
  sceneCardId?: string;
}) {
  const meta = workflowMeta[type];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-zinc-800 shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-zinc-950">{meta.label}</div>
          <p className="mt-1 text-xs leading-5 text-zinc-600">{meta.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge>{meta.scope}</Badge>
        <WorkflowButton projectId={projectId} type={type} tab={tab} sceneCardId={sceneCardId}>
          运行
        </WorkflowButton>
      </div>
    </div>
  );
}

function ChiefDecisionPanel({
  title,
  chief,
  action,
}: {
  title: string;
  chief: ChiefDecision;
  action?: React.ReactNode;
}) {
  if (!chief.summary && !chief.nextAction) return null;

  const chiefAction = readableChiefAction(chief.nextAction);
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-zinc-600" />
            <span className="font-medium text-zinc-950">{title}</span>
            <Badge className={chiefAction.tone}>下一步：{chiefAction.label}</Badge>
            {chief.overallScore !== undefined ? <Badge>评分：{chief.overallScore}</Badge> : null}
          </div>
          {chief.summary ? <p className="text-sm leading-6 text-zinc-600">{chief.summary}</p> : null}
          <div className="mt-3 grid gap-3 text-sm leading-6 md:grid-cols-2">
            <List title="核心问题" items={chief.coreProblems ?? []} />
            <List title="改写指令" items={chief.rewriteInstructions ?? []} />
          </div>
          {chief.reason ? <p className="mt-2 text-xs leading-5 text-zinc-500">原因：{chief.reason}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

function canReviseFromChief(chief?: ChiefDecision) {
  if (!chief) return false;
  if (chief.nextAction && chief.nextAction !== "approve") return true;
  return Boolean(chief.rewriteInstructions?.length || chief.coreProblems?.length);
}

function latestChiefFromReports(project: ProjectDetail, workflowTypes: string[]) {
  const report = project.reviewReports.find((item) => workflowTypes.includes(item.workflowType));
  const details = safeJsonParse<{ chiefOutput?: ChiefDecision; chief?: ChiefDecision }>(
    report?.detailsJson,
    {},
  );
  return { report, chief: details.chiefOutput ?? details.chief ?? {} };
}

function Overview({ project, totalWords }: { project: ProjectDetail; totalWords: number }) {
  const latestReport = project.reviewReports.find((report) => safeJsonParse<{
    chiefOutput?: { summary?: string };
  }>(report.detailsJson, {}).chiefOutput?.summary);
  const chiefOutput = safeJsonParse<{ chiefOutput?: ChiefDecision }>(latestReport?.detailsJson, {})
    .chiefOutput ?? {};
  const chiefAction = readableChiefAction(chiefOutput.nextAction);
  const platformProfile = getPlatformProfile(project.targetPlatform);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <h2 className="font-semibold">当前主编结论</h2>
        </CardHeader>
        <CardContent>
          {latestReport ? (
            <div className="grid gap-3 text-sm leading-6">
              <p>{chiefOutput.summary ?? "暂无摘要"}</p>
              <div className="flex flex-wrap gap-2">
                <Badge>评分：{chiefOutput.overallScore ?? "-"}</Badge>
                <Badge className={chiefAction.tone}>主编判断：{chiefAction.label}</Badge>
                <Badge>时间：{formatDate(latestReport.createdAt)}</Badge>
              </div>
              {chiefAction.hint ? <p className="text-zinc-600">{chiefAction.hint}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">还没有主编结论。先生成故事方向。</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">创作进度</h2>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Row label="平台" value={platformProfile.label} />
          <Row label="类型" value={project.genre} />
          <Row label="关键词" value={project.keywords || "-"} />
          <Row label="叙事视角" value={project.pov} />
          <Row label="当前字数" value={`${totalWords} / ${project.targetWordCount}`} />
          <Row label="更新时间" value={formatDate(project.updatedAt)} />
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <h2 className="font-semibold">常用工作流</h2>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(
            [
              "generate_story_directions",
              "generate_hooks",
              "generate_outline",
              "review_draft",
              "polish_final_draft",
            ] satisfies LocalJobType[]
          ).map((type) => (
            <WorkflowCard key={type} projectId={project.id} type={type} tab={workflowMeta[type].nextTab} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Directions({
  project,
  selectedDirectionId,
}: {
  project: ProjectDetail;
  selectedDirectionId?: string;
}) {
  const selectedDirection =
    project.storyDirections.find((direction) => direction.id === selectedDirectionId) ??
    project.storyDirections.find((direction) => direction.selected) ??
    project.storyDirections[0];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white/85 px-4 py-3 shadow-sm shadow-zinc-200/60">
        <div>
          <h2 className="text-lg font-semibold">故事方向</h2>
          <p className="mt-1 text-sm text-zinc-600">
            目标 {project.storyDirectionCount ?? 3} 个，当前 {project.storyDirections.length} 个，{project.storyDirections.find((direction) => direction.selected)?.title ?? "尚未选择"}
          </p>
        </div>
        <WorkflowButton projectId={project.id} type="generate_story_directions" tab="directions">
          一键重新生成
        </WorkflowButton>
      </div>
      {project.storyDirections.length === 0 ? <Empty text="还没有故事方向。" /> : null}
      {selectedDirection ? (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <DirectionDrawer project={project} selectedDirectionId={selectedDirection.id} />
          <StoryDirectionEditorCard key={selectedDirection.id} project={project} direction={selectedDirection} />
        </div>
      ) : null}
    </div>
  );
}

function DirectionDrawer({
  project,
  selectedDirectionId,
}: {
  project: ProjectDetail;
  selectedDirectionId?: string;
}) {
  return (
    <aside className="overflow-hidden rounded-lg border border-zinc-200 bg-white/95 shadow-sm shadow-zinc-200/60 lg:sticky lg:top-20 lg:max-h-[calc(100vh-24.5rem)]">
      <div className="border-b border-zinc-100 bg-zinc-50/80 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <PanelLeft className="h-4 w-4 shrink-0 text-zinc-600" />
            <span className="font-medium text-zinc-950">方向抽屉</span>
          </div>
          <Badge className="bg-white">{project.storyDirections.length} 个</Badge>
        </div>
      </div>
      <nav className="max-h-[420px] overflow-y-auto p-2 lg:max-h-[calc(100vh-28rem)]">
        <div className="grid gap-1">
          {project.storyDirections.map((direction, index) => {
            const selected = direction.id === selectedDirectionId;
            return (
              <PreserveScrollLink
                key={direction.id}
                href={projectTabHref(project.id, "directions", { directionId: direction.id })}
                className={cn(
                  "grid min-h-[78px] grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-md border px-3 py-2.5 text-left transition",
                  selected
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "border-transparent bg-white/60 text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold",
                    selected ? "bg-white text-zinc-950" : "bg-zinc-100 text-zinc-700",
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{direction.title}</span>
                    {direction.selected ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-500" /> : null}
                  </span>
                  <span className={cn("mt-1 block truncate text-xs", selected ? "text-zinc-300" : "text-zinc-500")}>
                    {direction.logline}
                  </span>
                  <span className={cn("mt-2 block text-xs", selected ? "text-zinc-200" : "text-zinc-500")}>
                    商业分 {direction.commercialScore}
                  </span>
                </span>
              </PreserveScrollLink>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function StoryDirectionEditorCard({
  project,
  direction,
}: {
  project: ProjectDetail;
  direction: StoryDirectionItem;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 bg-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white">
            <Compass className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Target className="h-3.5 w-3.5" />
              故事方向
            </div>
            <h3 className="truncate font-semibold text-zinc-950">{direction.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">{direction.logline}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge>商业分 {direction.commercialScore}</Badge>
          {direction.selected ? <Badge className="border-teal-200 bg-teal-50 text-teal-900">已选择</Badge> : null}
          <form action={selectDirectionAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="directionId" value={direction.id} />
            <SubmitButton variant={direction.selected ? "outline" : "primary"} pendingText="选择中">
              {direction.selected ? "已选择" : "选择"}
            </SubmitButton>
          </form>
        </div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" action={updateStoryDirectionAction}>
          <input type="hidden" name="id" value={direction.id} />
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="grid content-start gap-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <Field label="标题"><Input name="title" defaultValue={direction.title} /></Field>
                <Field label="商业分">
                  <Input name="commercialScore" type="number" defaultValue={direction.commercialScore} />
                </Field>
              </div>
              <Field label="一句话故事"><Textarea name="logline" defaultValue={direction.logline} /></Field>
              <TwoCols>
                <Field label="开篇钩子"><Textarea name="openingHook" defaultValue={direction.openingHook} /></Field>
                <Field label="核心冲突"><Textarea name="coreConflict" defaultValue={direction.coreConflict} /></Field>
                <Field label="主角困境">
                  <Textarea name="protagonistDilemma" defaultValue={direction.protagonistDilemma} />
                </Field>
                <Field label="主反转"><Textarea name="mainTwist" defaultValue={direction.mainTwist} /></Field>
                <Field label="情绪价值"><Textarea name="emotionalValue" defaultValue={direction.emotionalValue} /></Field>
              </TwoCols>
            </div>
            <div className="grid content-start gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <ListChecks className="h-4 w-4 text-zinc-500" />
                评估与取舍
              </div>
              <Field label="目标读者"><Textarea name="targetReaders" defaultValue={direction.targetReaders} /></Field>
              <Field label="风险"><Textarea name="risk" defaultValue={direction.risk} /></Field>
              <Field label="推荐理由">
                <Textarea name="recommendationReason" defaultValue={direction.recommendationReason} />
              </Field>
            </div>
          </div>
          <div className="flex justify-end">
            <SubmitButton variant="outline" pendingText="保存中">保存修改</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Hooks({ project }: { project: ProjectDetail }) {
  const hook = project.hookPackages[0];
  const chief = safeJsonParse<ChiefDecision>(hook?.chiefDecisionJson, {});
  const canRevise = hook && canReviseFromChief(chief);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-lg font-semibold">标题钩子</h2>
        <WorkflowButton projectId={project.id} type="generate_hooks" tab="hooks">
          一键生成/重生成
        </WorkflowButton>
      </div>
      {!hook ? (
        <Empty text="还没有标题钩子包。" />
      ) : (
        <>
          <ChiefDecisionPanel
            title="钩子主编结论"
            chief={chief}
            action={
              canRevise ? (
                <WorkflowButton projectId={project.id} type="revise_hooks" tab="hooks">
                  按结论修订钩子
                </WorkflowButton>
              ) : null
            }
          />
          <Card>
            <CardContent>
              <form action={updateHookPackageAction} className="grid gap-4">
                <input type="hidden" name="id" value={hook.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <TwoCols>
                  <Field label="选定标题"><Input name="selectedTitle" defaultValue={hook.selectedTitle ?? ""} /></Field>
                  <Field label="选定简介"><Input name="selectedLogline" defaultValue={hook.selectedLogline ?? ""} /></Field>
                </TwoCols>
                <Field label="选定开篇钩子"><Textarea name="selectedHook" defaultValue={hook.selectedHook ?? ""} /></Field>
                <TwoCols>
                  <Field label="标题候选 JSON"><Textarea name="titlesJson" defaultValue={hook.titlesJson} /></Field>
                  <Field label="简介候选 JSON"><Textarea name="loglinesJson" defaultValue={hook.loglinesJson} /></Field>
                  <Field label="钩子候选 JSON"><Textarea name="openingHooksJson" defaultValue={hook.openingHooksJson} /></Field>
                  <Field label="开篇前三段 JSON"><Textarea name="openingSamplesJson" defaultValue={hook.openingSamplesJson} /></Field>
                </TwoCols>
                <SubmitButton variant="outline" pendingText="保存中">保存钩子包</SubmitButton>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Characters({
  project,
  selectedCharacterId,
}: {
  project: ProjectDetail;
  selectedCharacterId?: string;
}) {
  const selectedCharacter =
    project.characters.find((character) => character.id === selectedCharacterId) ?? project.characters[0];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white/85 px-4 py-3 shadow-sm shadow-zinc-200/60">
        <div>
          <h2 className="text-lg font-semibold">人物设定</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {project.characters.length} 个人物，当前查看 {selectedCharacter?.name ?? "暂无"}
          </p>
        </div>
        <WorkflowButton projectId={project.id} type="generate_outline" tab="characters">
          生成人物与大纲
        </WorkflowButton>
      </div>
      {project.characters.length === 0 ? <Empty text="还没有人物设定。" /> : null}
      {selectedCharacter ? (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <CharacterDrawer project={project} selectedCharacterId={selectedCharacter.id} />
          <CharacterEditorCard key={selectedCharacter.id} project={project} character={selectedCharacter} />
        </div>
      ) : null}
    </div>
  );
}

function CharacterDrawer({
  project,
  selectedCharacterId,
}: {
  project: ProjectDetail;
  selectedCharacterId?: string;
}) {
  return (
    <aside className="overflow-hidden rounded-lg border border-zinc-200 bg-white/95 shadow-sm shadow-zinc-200/60 lg:sticky lg:top-20 lg:max-h-[calc(100vh-24.5rem)]">
      <div className="border-b border-zinc-100 bg-zinc-50/80 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <PanelLeft className="h-4 w-4 shrink-0 text-zinc-600" />
            <span className="font-medium text-zinc-950">人物抽屉</span>
          </div>
          <Badge className="bg-white">{project.characters.length} 人</Badge>
        </div>
      </div>
      <nav className="max-h-[420px] overflow-y-auto p-2 lg:max-h-[calc(100vh-28rem)]">
        <div className="grid gap-1">
          {project.characters.map((character) => {
            const selected = character.id === selectedCharacterId;
            return (
              <PreserveScrollLink
                key={character.id}
                href={projectTabHref(project.id, "characters", { characterId: character.id })}
                className={cn(
                  "grid min-h-[76px] grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-md border px-3 py-2.5 text-left transition",
                  selected
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "border-transparent bg-white/60 text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold",
                    selected ? "bg-white text-zinc-950" : "bg-zinc-100 text-zinc-700",
                  )}
                >
                  {character.name.slice(0, 1) || "人"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{character.name}</span>
                  <span className={cn("mt-1 block truncate text-xs", selected ? "text-zinc-300" : "text-zinc-500")}>
                    {character.role} / {character.identity}
                  </span>
                  <span className={cn("mt-2 block truncate text-xs", selected ? "text-zinc-200" : "text-zinc-500")}>
                    {character.plotFunction || character.relationshipToProtagonist}
                  </span>
                </span>
              </PreserveScrollLink>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function CharacterEditorCard({
  project,
  character,
}: {
  project: ProjectDetail;
  character: CharacterItem;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 bg-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Users className="h-3.5 w-3.5" />
              人物设定
            </div>
            <h3 className="truncate font-semibold text-zinc-950">{character.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">
              {character.role} / {character.identity}
            </p>
          </div>
        </div>
        <Badge>{character.role}</Badge>
      </CardHeader>
      <CardContent>
        <form action={updateCharacterAction} className="grid gap-5">
          <input type="hidden" name="id" value={character.id} />
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="grid content-start gap-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="姓名"><Input name="name" defaultValue={character.name} /></Field>
                <Field label="角色"><Input name="role" defaultValue={character.role} /></Field>
                <Field label="身份"><Input name="identity" defaultValue={character.identity} /></Field>
              </div>
              <TwoCols>
                <Field label="表层目标"><Textarea name="surfaceGoal" defaultValue={character.surfaceGoal} /></Field>
                <Field label="真实欲望"><Textarea name="trueDesire" defaultValue={character.trueDesire} /></Field>
                <Field label="弱点"><Textarea name="weakness" defaultValue={character.weakness} /></Field>
                <Field label="秘密"><Textarea name="secret" defaultValue={character.secret} /></Field>
              </TwoCols>
            </div>
            <div className="grid content-start gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <Target className="h-4 w-4 text-zinc-500" />
                剧情功能
              </div>
              <Field label="关系"><Textarea name="relationshipToProtagonist" defaultValue={character.relationshipToProtagonist} /></Field>
              <Field label="剧情功能"><Textarea name="plotFunction" defaultValue={character.plotFunction} /></Field>
              <Field label="转折"><Textarea name="turningPoint" defaultValue={character.turningPoint} /></Field>
              <Field label="结局"><Textarea name="ending" defaultValue={character.ending} /></Field>
            </div>
          </div>
          <div className="flex justify-end">
            <SubmitButton variant="outline" pendingText="保存中">保存人物设定</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Outline({ project }: { project: ProjectDetail }) {
  const outline = project.outlines[0];
  const { chief } = latestChiefFromReports(project, ["revise_outline", "generate_outline"]);
  const canRevise = outline && canReviseFromChief(chief);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-lg font-semibold">大纲结构</h2>
        <WorkflowButton projectId={project.id} type="generate_outline" tab="outline">
          一键生成/重生成
        </WorkflowButton>
      </div>
      {!outline ? (
        <Empty text="还没有大纲。" />
      ) : (
        <>
          <ChiefDecisionPanel
            title="大纲主编结论"
            chief={chief}
            action={
              canRevise ? (
                <WorkflowButton projectId={project.id} type="revise_outline" tab="outline">
                  按结论修订大纲
                </WorkflowButton>
              ) : null
            }
          />
          <Card>
            <CardHeader><h3 className="font-semibold">故事弧</h3></CardHeader>
            <CardContent className="text-sm leading-7">{outline.storyArc}</CardContent>
          </Card>
          <Card>
            <CardHeader><h3 className="font-semibold">分段大纲</h3></CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm leading-6">
                {safeJsonParse<string[]>(outline.outlineJson, []).map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><h3 className="font-semibold">冲突升级 / 情绪曲线</h3></CardHeader>
            <CardContent className="grid gap-3 text-sm leading-6 md:grid-cols-2">
              <div>{outline.conflictEscalation}</div>
              <ul>
                {safeJsonParse<string[]>(outline.emotionalCurveJson, []).map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Scenes({ project, selectedSceneId }: { project: ProjectDetail; selectedSceneId?: string }) {
  const selectedScene =
    project.sceneCards.find((scene) => scene.id === selectedSceneId) ?? project.sceneCards[0];
  const segmentBySceneId = buildSegmentBySceneId(project.draftSegments);
  const writtenScenes = project.sceneCards.filter((scene) => segmentBySceneId.has(scene.id)).length;
  const remainingScenes = Math.max(project.sceneCards.length - writtenScenes, 0);
  const { chief } = latestChiefFromReports(project, ["revise_outline", "generate_outline"]);
  const canRevise = project.sceneCards.length > 0 && canReviseFromChief(chief);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white/85 px-4 py-3 shadow-sm shadow-zinc-200/60">
        <div>
          <h2 className="text-lg font-semibold">场景卡片</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {writtenScenes} 个已有正文，{remainingScenes} 个待写
          </p>
        </div>
        <Badge>{project.sceneCards.length} 张卡片</Badge>
      </div>
      {project.sceneCards.length === 0 ? <Empty text="还没有场景卡。先生成人物与大纲。" /> : null}
      {project.sceneCards.length ? (
        <ChiefDecisionPanel
          title="场景卡主编结论"
          chief={chief}
          action={
            canRevise ? (
              <WorkflowButton projectId={project.id} type="revise_outline" tab="scenes" focusSceneId={selectedScene?.id}>
                按结论修订场景卡
              </WorkflowButton>
            ) : null
          }
        />
      ) : null}
      {selectedScene ? (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <SceneDrawer
            project={project}
            tab="scenes"
            selectedSceneId={selectedScene.id}
            segmentBySceneId={segmentBySceneId}
          />
          <SceneEditorCard
            key={selectedScene.id}
            project={project}
            scene={selectedScene}
            segment={segmentBySceneId.get(selectedScene.id)}
          />
        </div>
      ) : null}
    </div>
  );
}

function Writing({
  project,
  selectedSceneId,
  selectedSegmentId,
}: {
  project: ProjectDetail;
  selectedSceneId?: string;
  selectedSegmentId?: string;
}) {
  const orderedSegments = [...project.draftSegments].sort(
    (a, b) => (a.sceneCard?.orderIndex ?? 9999) - (b.sceneCard?.orderIndex ?? 9999),
  );
  const segmentBySceneId = buildSegmentBySceneId(orderedSegments);
  const manualSegments = orderedSegments.filter((segment) => !segment.sceneCardId);
  const selectedManualSegment = manualSegments.find((segment) => segment.id === selectedSegmentId);
  const selectedScene = selectedManualSegment
    ? undefined
    : project.sceneCards.find((scene) => scene.id === selectedSceneId) ?? project.sceneCards[0];
  const selectedSegment =
    selectedManualSegment ??
    (selectedScene ? segmentBySceneId.get(selectedScene.id) : undefined) ??
    (project.sceneCards.length === 0 ? orderedSegments[0] : undefined);
  const activeSceneId = selectedScene?.id ?? selectedSegment?.sceneCardId ?? undefined;
  const totalWords = project.draftSegments.reduce((sum, item) => sum + item.wordCount, 0);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white/85 px-4 py-3 shadow-sm shadow-zinc-200/60">
        <div>
          <h2 className="text-lg font-semibold">正文写作</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {orderedSegments.length} 段正文，{project.sceneCards.length} 个场景
          </p>
        </div>
        <Badge>全文 {totalWords} 字</Badge>
      </div>
      {project.sceneCards.length === 0 && orderedSegments.length === 0 ? (
        <Empty text="还没有正文。去场景卡片里选择一个场景生成。" />
      ) : null}
      {project.sceneCards.length || orderedSegments.length ? (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <SceneDrawer
            project={project}
            tab="writing"
            selectedSceneId={activeSceneId}
            selectedSegmentId={selectedManualSegment?.id}
            segmentBySceneId={segmentBySceneId}
            manualSegments={manualSegments}
          />
          {selectedSegment ? (
            <DraftEditorCard
              key={selectedSegment.id}
              project={project}
              segment={selectedSegment}
              scene={selectedScene}
            />
          ) : selectedScene ? (
            <UnwrittenSceneCard key={selectedScene.id} project={project} scene={selectedScene} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SceneDrawer({
  project,
  tab,
  selectedSceneId,
  selectedSegmentId,
  segmentBySceneId,
  manualSegments = [],
}: {
  project: ProjectDetail;
  tab: "scenes" | "writing";
  selectedSceneId?: string;
  selectedSegmentId?: string;
  segmentBySceneId: Map<string, DraftSegmentItem>;
  manualSegments?: DraftSegmentItem[];
}) {
  const writtenScenes = project.sceneCards.filter((scene) => segmentBySceneId.has(scene.id)).length;
  const progress = project.sceneCards.length ? Math.round((writtenScenes / project.sceneCards.length) * 100) : 0;
  const drawerWords = Array.from(segmentBySceneId.values()).reduce((sum, segment) => sum + segment.wordCount, 0);
  const drawerTitle = tab === "writing" ? "正文抽屉" : "场景抽屉";
  const drawerMeta = tab === "writing" ? `${drawerWords} 字` : `${writtenScenes}/${project.sceneCards.length} 已写`;

  return (
    <aside className="overflow-hidden rounded-lg border border-zinc-200 bg-white/95 shadow-sm shadow-zinc-200/60 lg:sticky lg:top-20 lg:max-h-[calc(100vh-24.5rem)]">
      <div className="border-b border-zinc-100 bg-zinc-50/80 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <PanelLeft className="h-4 w-4 shrink-0 text-zinc-600" />
            <span className="font-medium text-zinc-950">{drawerTitle}</span>
          </div>
          <Badge className="bg-white">{drawerMeta}</Badge>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full rounded-full bg-teal-700" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <nav className="max-h-[420px] overflow-y-auto p-2 lg:max-h-[calc(100vh-29rem)]">
        <div className="grid gap-1">
          {project.sceneCards.map((scene) => {
            const segment = segmentBySceneId.get(scene.id);
            const selected = scene.id === selectedSceneId;
            return (
              <PreserveScrollLink
                key={scene.id}
                href={projectTabHref(project.id, tab, { sceneId: scene.id })}
                className={cn(
                  "grid min-h-[74px] grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-md border px-3 py-2.5 text-left transition",
                  selected
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "border-transparent bg-white/60 text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold",
                    selected ? "bg-white text-zinc-950" : "bg-zinc-100 text-zinc-700",
                  )}
                >
                  {scene.orderIndex}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{scene.title}</span>
                  <span className={cn("mt-1 block truncate text-xs", selected ? "text-zinc-300" : "text-zinc-500")}>
                    {scene.goal || scene.conflict || "未填写目标"}
                  </span>
                  <span className={cn("mt-2 flex items-center gap-2 text-xs", selected ? "text-zinc-200" : "text-zinc-500")}>
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        segment ? "bg-teal-500" : "bg-zinc-300",
                        selected && (segment ? "bg-teal-300" : "bg-zinc-400"),
                      )}
                    />
                    {segment ? `${segment.wordCount} 字` : "未写正文"} / {readableSceneStatus(scene.status)}
                  </span>
                </span>
              </PreserveScrollLink>
            );
          })}
        </div>
        {manualSegments.length ? (
          <div className="mt-4 border-t border-zinc-100 pt-3">
            <div className="mb-2 px-2 text-xs font-medium text-zinc-500">未绑定场景的正文</div>
            <div className="grid gap-1">
              {manualSegments.map((segment) => {
                const selected = segment.id === selectedSegmentId;
                return (
                  <PreserveScrollLink
                    key={segment.id}
                    href={projectTabHref(project.id, "writing", { segmentId: segment.id })}
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 transition",
                      selected
                        ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                        : "border-transparent bg-white/60 text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50",
                    )}
                  >
                    <ScrollText className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{segment.title}</span>
                      <span className={cn("mt-1 block text-xs", selected ? "text-zinc-200" : "text-zinc-500")}>
                        {segment.wordCount} 字 / {readableSceneStatus(segment.status)}
                      </span>
                    </span>
                  </PreserveScrollLink>
                );
              })}
            </div>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

function SceneEditorCard({
  project,
  scene,
  segment,
}: {
  project: ProjectDetail;
  scene: SceneCardItem;
  segment?: DraftSegmentItem;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 bg-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-base font-semibold text-white">
            {scene.orderIndex}
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-500">
              <ListChecks className="h-3.5 w-3.5" />
              场景卡
            </div>
            <h3 className="truncate font-semibold text-zinc-950">{scene.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">{scene.conflict || scene.goal}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge>{readableSceneStatus(scene.status)}</Badge>
          {segment ? (
            <Link
              className={buttonVariants("outline")}
              href={projectTabHref(project.id, "writing", { sceneId: scene.id })}
              scroll={false}
            >
              <FileText className="h-4 w-4" />
              查看正文
            </Link>
          ) : null}
          <WorkflowButton projectId={project.id} type="write_scene" tab="writing" sceneCardId={scene.id}>
            写这个场景
          </WorkflowButton>
        </div>
      </CardHeader>
      <CardContent>
        <form action={updateSceneCardAction} className="grid gap-5">
          <input type="hidden" name="id" value={scene.id} />
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="grid content-start gap-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <Field label="标题"><Input name="title" defaultValue={scene.title} /></Field>
                <Field label="状态"><Input name="status" defaultValue={scene.status} /></Field>
              </div>
              <TwoCols>
                <Field label="目标"><Textarea className="min-h-24" name="goal" defaultValue={scene.goal} /></Field>
                <Field label="地点"><Textarea className="min-h-24" name="location" defaultValue={scene.location} /></Field>
                <Field label="冲突"><Textarea className="min-h-24" name="conflict" defaultValue={scene.conflict} /></Field>
                <Field label="信息增量">
                  <Textarea className="min-h-24" name="informationGain" defaultValue={scene.informationGain} />
                </Field>
                <Field label="情绪变化">
                  <Textarea className="min-h-24" name="emotionalShift" defaultValue={scene.emotionalShift} />
                </Field>
                <Field label="回收"><Textarea className="min-h-24" name="payoff" defaultValue={scene.payoff} /></Field>
              </TwoCols>
            </div>
            <div className="grid content-start gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <Target className="h-4 w-4 text-zinc-500" />
                写作约束
              </div>
              <Field label="必须包含 JSON"><Textarea name="mustIncludeJson" defaultValue={scene.mustIncludeJson} /></Field>
              <Field label="伏笔 JSON"><Textarea name="foreshadowingJson" defaultValue={scene.foreshadowingJson} /></Field>
              <Field label="禁止 JSON"><Textarea name="forbiddenJson" defaultValue={scene.forbiddenJson} /></Field>
            </div>
          </div>
          <div className="flex justify-end">
            <SubmitButton variant="outline" pendingText="保存中">保存场景卡</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DraftEditorCard({
  project,
  segment,
  scene,
}: {
  project: ProjectDetail;
  segment: DraftSegmentItem;
  scene?: SceneCardItem;
}) {
  const referenceScene = scene ?? segment.sceneCard ?? undefined;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 bg-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white">
            <PenLine className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-500">
              <ScrollText className="h-3.5 w-3.5" />
              正文版本
            </div>
            <h3 className="truncate font-semibold text-zinc-950">{segment.title}</h3>
            <p className="text-sm text-zinc-600">
              {referenceScene?.title ?? "手动段落"} / {segment.wordCount} 字 / {readableSceneStatus(segment.status)}
            </p>
          </div>
        </div>
        <CopyButton text={segment.content} />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <form action={updateDraftSegmentAction} className="grid gap-3">
              <input type="hidden" name="id" value={segment.id} />
              <input type="hidden" name="projectId" value={project.id} />
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                <Field label="标题"><Input name="title" defaultValue={segment.title} /></Field>
                <Field label="状态"><Input name="status" defaultValue={segment.status} /></Field>
              </div>
              <MarkdownEditor name="content" defaultValue={segment.content} minHeight={520} />
              <div className="flex justify-end">
                <SubmitButton variant="outline" pendingText="保存中">保存正文版本</SubmitButton>
              </div>
            </form>
            <SegmentChiefPanel project={project} segment={segment} />
          </div>
          {referenceScene ? <SceneReferencePanel scene={referenceScene} compact /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function UnwrittenSceneCard({ project, scene }: { project: ProjectDetail; scene: SceneCardItem }) {
  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            {scene.orderIndex}. {scene.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">当前场景还没有正文。</p>
        </div>
        <WorkflowButton projectId={project.id} type="write_scene" tab="writing" sceneCardId={scene.id}>
          写这个场景
        </WorkflowButton>
      </CardHeader>
      <CardContent>
        <SceneReferencePanel scene={scene} />
      </CardContent>
    </Card>
  );
}

function SceneReferencePanel({ scene, compact = false }: { scene: SceneCardItem; compact?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-zinc-200 bg-zinc-50/90 p-4", compact && "xl:sticky xl:top-20")}>
      <div className="mb-3 flex items-center gap-2 font-medium text-zinc-950">
        <BookOpenCheck className="h-4 w-4 text-zinc-600" />
        当前场景卡
      </div>
      <div className={cn("grid gap-3 text-sm leading-6", compact ? "grid-cols-1" : "md:grid-cols-2")}>
        <MiniRow label="目标" value={scene.goal} />
        <MiniRow label="地点" value={scene.location} />
        <MiniRow label="冲突" value={scene.conflict} />
        <MiniRow label="信息增量" value={scene.informationGain} />
        <MiniRow label="情绪变化" value={scene.emotionalShift} />
        <MiniRow label="回收" value={scene.payoff} />
      </div>
      {scene.mustIncludeJson !== "[]" || scene.foreshadowingJson !== "[]" || scene.forbiddenJson !== "[]" ? (
        <div className={cn("mt-3 grid gap-2 text-xs leading-5 text-zinc-600", compact ? "grid-cols-1" : "md:grid-cols-3")}>
          <MiniBlock label="必须包含" value={scene.mustIncludeJson} />
          <MiniBlock label="伏笔" value={scene.foreshadowingJson} />
          <MiniBlock label="禁止" value={scene.forbiddenJson} />
        </div>
      ) : null}
    </div>
  );
}

function SegmentChiefPanel({
  project,
  segment,
}: {
  project: ProjectDetail;
  segment: ProjectDetail["draftSegments"][number];
}) {
  const chief = safeJsonParse<ChiefDecision>(segment.chiefDecisionJson, {});
  const action = readableChiefAction(chief.nextAction);
  const currentScene = segment.sceneCard;
  const canRevise = Boolean(currentScene && canReviseFromChief(chief));
  const nextScene = currentScene
    ? project.sceneCards.find((scene) => scene.orderIndex === currentScene.orderIndex + 1)
    : undefined;

  if (!chief.summary && !chief.nextAction) return null;

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-zinc-600" />
            <span className="font-medium text-zinc-950">本场主编结论</span>
            <Badge className={action.tone}>{action.label}</Badge>
            {chief.overallScore !== undefined ? <Badge>评分：{chief.overallScore}</Badge> : null}
          </div>
          {chief.summary ? <p className="text-sm leading-6 text-zinc-600">{chief.summary}</p> : null}
          {chief.rewriteInstructions?.length ? (
            <ul className="mt-2 grid gap-1 text-sm text-zinc-700">
              {chief.rewriteInstructions.slice(0, 3).map((item, index) => (
                <li key={index}>- {item}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {currentScene && canRevise ? (
            <WorkflowButton projectId={project.id} type="revise_scene" tab="writing" sceneCardId={currentScene.id}>
              按主编结论修订本场
            </WorkflowButton>
          ) : null}
          {currentScene && chief.nextAction === "regenerate" ? (
            <WorkflowButton projectId={project.id} type="write_scene" tab="writing" sceneCardId={currentScene.id}>
              重新生成本场
            </WorkflowButton>
          ) : null}
          {nextScene ? (
            <WorkflowButton projectId={project.id} type="write_scene" tab="writing" sceneCardId={nextScene.id}>
              继续写下一场
            </WorkflowButton>
          ) : (
            <WorkflowButton projectId={project.id} type="review_draft" tab="reviews">
              进入全文审稿
            </WorkflowButton>
          )}
        </div>
      </div>
    </div>
  );
}

function Reviews({ project }: { project: ProjectDetail }) {
  const latestReport = project.reviewReports.find((report) => report.workflowType === "review_draft");
  const chief = safeJsonParse<{ chiefOutput?: ChiefDecision }>(latestReport?.detailsJson, {})
    .chiefOutput ?? {};
  const scoreObject = safeJsonParse<Record<string, unknown>>(latestReport?.scoresJson, {});
  const hints = scoreHints(scoreObject as never);
  const latestPolishReport = project.reviewReports.find(
    (report) => report.workflowType === "polish_final_draft",
  );
  const polishDetails = safeJsonParse<{
    polishOutput?: { polishedContent?: string; report?: string };
  }>(latestPolishReport?.detailsJson, {});
  const chiefAction = readableChiefAction(chief.nextAction);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">全文审稿与润色</h2>
          <p className="mt-1 text-sm text-zinc-600">这里处理的是所有已写场景合并后的全文，不是单个场景。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <WorkflowButton projectId={project.id} type="review_draft" tab="reviews">全文完稿审稿</WorkflowButton>
          <WorkflowButton projectId={project.id} type="polish_final_draft" tab="reviews">生成全文润色稿</WorkflowButton>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <WorkflowCard projectId={project.id} type="review_draft" tab="reviews" />
        <WorkflowCard projectId={project.id} type="polish_final_draft" tab="reviews" />
      </div>
      <Card>
        <CardHeader><h3 className="font-semibold">主编结论</h3></CardHeader>
        <CardContent className="grid gap-3 text-sm leading-6">
          {chief.summary ? (
            <>
              <p>{chief.summary}</p>
              <div className="flex flex-wrap gap-2">
                <Badge>评分：{chief.overallScore ?? "-"}</Badge>
                <Badge className={chiefAction.tone}>下一步：{chiefAction.label}</Badge>
              </div>
              <List title="核心问题" items={chief.coreProblems ?? []} />
              <List title="采纳意见" items={chief.acceptedSuggestions ?? []} />
              <List title="不采纳意见" items={chief.rejectedSuggestions ?? []} />
              <List title="改写指令" items={chief.rewriteInstructions ?? []} />
              {hints.length ? <List title="评分提示" items={hints} /> : null}
            </>
          ) : (
            <p className="text-zinc-500">暂无主编结论。</p>
          )}
        </CardContent>
      </Card>
      {polishDetails.polishOutput?.polishedContent ? (
        <Card className="border-teal-200">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">最新全文润色稿</h3>
              <p className="mt-1 text-sm text-zinc-600">由“全文最终润色”生成，可复制后再人工定稿。</p>
            </div>
            <CopyButton text={polishDetails.polishOutput.polishedContent} />
          </CardHeader>
          <CardContent>
            {polishDetails.polishOutput.report ? (
              <p className="mb-3 rounded-md bg-teal-50 p-3 text-sm leading-6 text-teal-900">
                {polishDetails.polishOutput.report}
              </p>
            ) : null}
            <div className="prose max-w-none whitespace-pre-wrap rounded-md border border-zinc-200 bg-white p-4 text-sm leading-7">
              {polishDetails.polishOutput.polishedContent}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><h3 className="font-semibold">Agent 运行日志</h3></CardHeader>
        <CardContent className="grid gap-2">
          {project.agentRuns.map((run) => (
            <div key={run.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <div className="font-medium">
                {run.agentName} / {run.workflowType} / {readableAgentRunStatus(run.status)} / {formatDate(run.createdAt)}
              </div>
              {run.durationMs ? (
                <p className="mt-1 text-xs text-zinc-600">耗时：{Math.round(run.durationMs / 1000)} 秒</p>
              ) : null}
              {run.error ? <p className="mt-2 text-rose-700">{run.error}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Versions({ project, diffId }: { project: ProjectDetail; diffId?: string }) {
  const versions = project.draftSegments.flatMap((segment) =>
    segment.versions.map((version) => ({ ...version, segment })),
  );
  const selected = versions.find((version) => version.id === diffId);
  const diff = selected ? buildWordDiff(selected.content, selected.segment.content) : [];

  return (
    <div className="grid gap-4">
      <h2 className="text-lg font-semibold">版本历史</h2>
      {selected ? (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Diff：{selected.segment.title}</h3>
          </CardHeader>
          <CardContent className="text-sm leading-7">
            {diff.map((part) => (
              <span
                key={part.id}
                className={cn(part.added && "bg-emerald-100", part.removed && "bg-rose-100 line-through")}
              >
                {part.value}
              </span>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-2">
        {versions.length === 0 ? <Empty text="暂无正文版本。" /> : null}
        {versions.map((version) => (
          <Card key={version.id}>
            <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm">
                <div className="font-medium">{version.segment.title}</div>
                <div className="text-zinc-500">
                  {formatDate(version.createdAt)} / {version.createdByAgent} / {version.reason}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className={buttonVariants("outline")} href={`/projects/${project.id}?tab=versions&diff=${version.id}`}>
                  <GitCompare className="h-4 w-4" />
                  Diff
                </Link>
                <form action={rollbackDraftVersionAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="versionId" value={version.id} />
                  <SubmitButton variant="outline" pendingText="回滚中">回滚</SubmitButton>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Export({ project, exportId }: { project: ProjectDetail; exportId?: string }) {
  const exportTypes = [
    ["draft_markdown", "完整正文 Markdown"],
    ["draft_txt", "完整正文 TXT"],
    ["draft_docx", "完整正文 DOCX"],
    ["story_bible_markdown", "故事设定集 Markdown"],
    ["outline_markdown", "大纲 + 场景卡 Markdown"],
    ["submission_report_markdown", "投稿自检报告 Markdown"],
  ];

  return (
    <div className="grid gap-4">
      <h2 className="text-lg font-semibold">导出</h2>
      {exportId ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          导出完成。文件已写入项目根目录的 exports 文件夹。
        </div>
      ) : null}
      <Card>
        <CardContent className="flex flex-wrap gap-2">
          {exportTypes.map(([type, label]) => (
            <form action={exportProjectAction} key={type}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="type" value={type} />
              <SubmitButton variant="outline" pendingText="导出中">
                <Download className="h-4 w-4" />
                {label}
              </SubmitButton>
            </form>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><h3 className="font-semibold">已导出文件</h3></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {project.exportFiles.length === 0 ? <p className="text-zinc-500">暂无导出文件。</p> : null}
          {project.exportFiles.map((file) => (
            <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 p-3">
              <div>
                <div className="font-medium">{file.fileName}</div>
                <div className="text-xs text-zinc-500">{file.path}</div>
              </div>
              <a className={buttonVariants("outline")} href={`/api/exports/${file.id}/download`}>
                下载
              </a>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectSettings({ project }: { project: ProjectDetail }) {
  const bible = project.storyBible;
  const platformProfile = getPlatformProfile(project.targetPlatform);
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><h2 className="font-semibold">项目设置</h2></CardHeader>
        <CardContent>
          <form action={updateProjectAction} className="grid gap-4">
            <input type="hidden" name="id" value={project.id} />
            <TwoCols>
              <Field label="标题"><Input name="title" defaultValue={project.title} /></Field>
              <Field label="类型"><Input name="genre" defaultValue={project.genre} /></Field>
              <Field label="故事方向数量">
                <select
                  name="storyDirectionCount"
                  className={selectClassName}
                  defaultValue={String(project.storyDirectionCount ?? 3)}
                >
                  {[1, 2, 3, 4].map((option) => (
                    <option key={option} value={option}>
                      {option} 个
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="关键词"><Input name="keywords" defaultValue={project.keywords} /></Field>
              <Field label="目标字数"><Input name="targetWordCount" type="number" defaultValue={project.targetWordCount} /></Field>
              <Field label="目标平台">
                <select
                  name="targetPlatform"
                  className={selectClassName}
                  defaultValue={project.targetPlatform || DEFAULT_PLATFORM_KEY}
                >
                  {platformProfiles.map((profile) => (
                    <option key={profile.key} value={profile.key}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="叙事视角"><Input name="pov" defaultValue={project.pov} /></Field>
              <Field label="结局倾向"><Input name="endingPreference" defaultValue={project.endingPreference} /></Field>
              <Field label="情绪基调"><Input name="emotionalTone" defaultValue={project.emotionalTone} /></Field>
              <Field label="参考类型风格">
                <Input
                  name="genreStyleReference"
                  defaultValue={project.genreStyleReference}
                  placeholder="例如：强钩子悬疑短篇，线索前置，结尾清算。"
                />
              </Field>
              <Field label="参考语言风格">
                <Input
                  name="languageStyleReference"
                  defaultValue={project.languageStyleReference}
                  placeholder="例如：口语化、有火气、少总结、多现场感。"
                />
              </Field>
            </TwoCols>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
              <div className="font-medium">{platformProfile.label}</div>
              <p className="mt-1 text-sky-800">{platformProfile.summary}</p>
            </div>
            <Field label="原始灵感"><Textarea name="originalIdea" defaultValue={project.originalIdea} /></Field>
            <Field label="平台补充要求">
              <Textarea
                name="platformRequirementOverride"
                defaultValue={project.platformRequirementOverride}
                placeholder="例如：知乎体必须导语 + 1、2、3、4 分节；分节不要小标题；结尾必须反转清算。"
              />
            </Field>
            <Field label="禁止事项"><Textarea name="forbiddenItems" defaultValue={project.forbiddenItems} /></Field>
            <SubmitButton variant="outline" pendingText="保存中">保存项目设置</SubmitButton>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><h2 className="font-semibold">Story Bible</h2></CardHeader>
        <CardContent>
          <form action={saveStoryBibleAction} className="grid gap-4">
            <input type="hidden" name="projectId" value={project.id} />
            <Field label="前文摘要"><Textarea name="previousSummary" defaultValue={bible?.previousSummary ?? ""} /></Field>
            <TwoCols>
              <Field label="已发生事件 JSON"><Textarea name="happenedEvents" defaultValue={bible?.happenedEvents ?? "[]"} /></Field>
              <Field label="已揭露秘密 JSON"><Textarea name="revealedSecrets" defaultValue={bible?.revealedSecrets ?? "[]"} /></Field>
              <Field label="未揭露秘密 JSON"><Textarea name="unrevealedSecrets" defaultValue={bible?.unrevealedSecrets ?? "[]"} /></Field>
              <Field label="开放伏笔 JSON"><Textarea name="openForeshadowing" defaultValue={bible?.openForeshadowing ?? "[]"} /></Field>
              <Field label="已回收伏笔 JSON"><Textarea name="resolvedForeshadowing" defaultValue={bible?.resolvedForeshadowing ?? "[]"} /></Field>
              <Field label="人物状态 JSON"><Textarea name="characterStates" defaultValue={bible?.characterStates ?? "{}"} /></Field>
              <Field label="时间线 JSON"><Textarea name="timeline" defaultValue={bible?.timeline ?? "[]"} /></Field>
            </TwoCols>
            <SubmitButton variant="outline" pendingText="保存中">保存 Story Bible</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="min-w-0">{value}</span>
    </div>
  );
}

function readableAgentRunStatus(status: string) {
  if (status === "success") return "完成";
  if (status === "failed") return "失败";
  if (status === "running") return "请求中";
  if (status === "pending") return "排队中";
  return status;
}

function MiniRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words text-zinc-800">{value || "-"}</span>
    </div>
  );
}

function MiniBlock({ label, value }: { label: string; value: string }) {
  if (!value || value === "[]" || value === "{}") return null;
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="mb-1 font-medium text-zinc-800">{label}</div>
      <div className="max-h-24 overflow-auto whitespace-pre-wrap break-words">{value}</div>
    </div>
  );
}

function buildSegmentBySceneId(segments: DraftSegmentItem[]) {
  const bySceneId = new Map<string, DraftSegmentItem>();
  for (const segment of segments) {
    if (segment.sceneCardId) bySceneId.set(segment.sceneCardId, segment);
  }
  return bySceneId;
}

function projectTabHref(
  projectId: string,
  tab: string,
  params: Record<string, string | undefined> = {},
) {
  const search = new URLSearchParams({ tab });
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/projects/${projectId}?${search.toString()}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TwoCols({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>;
}

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-zinc-500">{text}</CardContent>
    </Card>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 font-medium">{title}</div>
      <ul className="grid gap-1 text-zinc-700">
        {items.map((item, index) => (
          <li key={index}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
