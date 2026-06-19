import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpenCheck,
  CheckCircle2,
  Download,
  FileText,
  GitCompare,
  Info,
  ListChecks,
  Play,
} from "lucide-react";
import {
  rollbackDraftVersionAction,
  saveStoryBibleAction,
  selectDirectionAction,
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
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/db/prisma";
import { buildWordDiff } from "@/lib/diff/textDiff";
import type { LocalJobType } from "@/lib/jobs/runner";
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
      agentRuns: { orderBy: { createdAt: "desc" }, take: 60 },
      reviewReports: { orderBy: { createdAt: "desc" }, take: 20 },
      storyBible: true,
      foreshadowings: true,
      twists: true,
      exportFiles: { orderBy: { createdAt: "desc" } },
      localJobs: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}

type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type SceneCardItem = ProjectDetail["sceneCards"][number];
type DraftSegmentItem = ProjectDetail["draftSegments"][number];

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
  const totalWords = project.draftSegments.reduce((sum, item) => sum + item.wordCount, 0);
  const writtenScenes = project.sceneCards.filter((scene) =>
    project.draftSegments.some((segment) => segment.sceneCardId === scene.id),
  ).length;
  const progress = project.targetWordCount
    ? Math.min(100, Math.round((totalWords / project.targetWordCount) * 100))
    : 0;

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <section className="mb-5 rounded-lg border border-zinc-200/80 bg-white/90 px-5 py-5 shadow-sm shadow-zinc-200/70">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link className="text-sm text-zinc-500 hover:text-zinc-900" href="/dashboard">
                项目
              </Link>
              <span className="text-zinc-300">/</span>
              <Badge className="border-teal-200 bg-teal-50 text-teal-900">{readableStage(project.currentStage)}</Badge>
              <Badge>{project.genre}</Badge>
            </div>
            <h1 className="text-2xl font-semibold text-zinc-950">{project.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{project.originalIdea}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm sm:min-w-[360px]">
            <Metric label="目标字数" value={project.targetWordCount.toString()} />
            <Metric label="当前字数" value={totalWords.toString()} />
            <Metric label="已写场景" value={`${writtenScenes}/${project.sceneCards.length || 0}`} />
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>正文进度</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-teal-700" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <StageRail project={project} activeTab={activeTab} />
      </section>

      <nav className="sticky top-0 z-10 mb-4 flex gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white/92 p-1 shadow-sm backdrop-blur">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/projects/${project.id}?tab=${key}`}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm text-zinc-600 transition",
              activeTab === key && "bg-zinc-950 text-white shadow-sm",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

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

      <JobWatcher jobId={watchedJobId} projectId={project.id} tab={activeTab} focusSceneId={query.sceneId} />

      {activeTab === "overview" ? <Overview project={project} totalWords={totalWords} /> : null}
      {activeTab === "directions" ? <Directions project={project} /> : null}
      {activeTab === "hooks" ? <Hooks project={project} /> : null}
      {activeTab === "characters" ? <Characters project={project} /> : null}
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
    <div className="mt-5 grid gap-2 md:grid-cols-7">
      {projectMilestones.map((milestone) => {
        const Icon = milestone.icon;
        const done = completed.has(milestone.key);
        const active = activeTab === milestone.key;
        return (
          <Link
            key={milestone.key}
            href={`/projects/${project.id}?tab=${milestone.key}`}
            className={cn(
              "flex min-h-14 items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
              done && "border-teal-200 bg-teal-50 text-teal-950",
              active && "border-zinc-950 bg-zinc-950 text-white",
              !done && !active && "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-white",
            )}
          >
            {done && !active ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            <span>{milestone.label}</span>
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
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="text-base font-semibold">{value}</div>
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

function Overview({ project, totalWords }: { project: ProjectDetail; totalWords: number }) {
  const latestChief = project.agentRuns.find(
    (run) => run.agentName === "ChiefEditorAgent" && run.status === "success",
  );
  const chiefOutput = safeJsonParse<{ summary?: string; overallScore?: number; nextAction?: string }>(
    latestChief?.outputJson,
    {},
  );
  const chiefAction = readableChiefAction(chiefOutput.nextAction);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <h2 className="font-semibold">当前主编结论</h2>
        </CardHeader>
        <CardContent>
          {latestChief ? (
            <div className="grid gap-3 text-sm leading-6">
              <p>{chiefOutput.summary ?? "暂无摘要"}</p>
              <div className="flex flex-wrap gap-2">
                <Badge>评分：{chiefOutput.overallScore ?? "-"}</Badge>
                <Badge className={chiefAction.tone}>主编判断：{chiefAction.label}</Badge>
                <Badge>时间：{formatDate(latestChief.createdAt)}</Badge>
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

function Directions({ project }: { project: ProjectDetail }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-lg font-semibold">故事方向</h2>
        <WorkflowButton projectId={project.id} type="generate_story_directions" tab="directions">
          一键重新生成
        </WorkflowButton>
      </div>
      {project.storyDirections.length === 0 ? <Empty text="还没有故事方向。" /> : null}
      {project.storyDirections.map((direction) => (
        <Card key={direction.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{direction.title}</h3>
              <p className="mt-1 text-sm text-zinc-600">{direction.logline}</p>
            </div>
            <form action={selectDirectionAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="directionId" value={direction.id} />
              <SubmitButton variant={direction.selected ? "outline" : "primary"} pendingText="选择中">
                {direction.selected ? "已选择" : "选择"}
              </SubmitButton>
            </form>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" action={updateStoryDirectionAction}>
              <input type="hidden" name="id" value={direction.id} />
              <input type="hidden" name="projectId" value={project.id} />
              <TwoCols>
                <Field label="标题"><Input name="title" defaultValue={direction.title} /></Field>
                <Field label="商业分"><Input name="commercialScore" type="number" defaultValue={direction.commercialScore} /></Field>
              </TwoCols>
              <Field label="一句话故事"><Textarea name="logline" defaultValue={direction.logline} /></Field>
              <TwoCols>
                <Field label="开篇钩子"><Textarea name="openingHook" defaultValue={direction.openingHook} /></Field>
                <Field label="核心冲突"><Textarea name="coreConflict" defaultValue={direction.coreConflict} /></Field>
                <Field label="主角困境"><Textarea name="protagonistDilemma" defaultValue={direction.protagonistDilemma} /></Field>
                <Field label="主反转"><Textarea name="mainTwist" defaultValue={direction.mainTwist} /></Field>
                <Field label="情绪价值"><Textarea name="emotionalValue" defaultValue={direction.emotionalValue} /></Field>
                <Field label="目标读者"><Textarea name="targetReaders" defaultValue={direction.targetReaders} /></Field>
                <Field label="风险"><Textarea name="risk" defaultValue={direction.risk} /></Field>
                <Field label="推荐理由"><Textarea name="recommendationReason" defaultValue={direction.recommendationReason} /></Field>
              </TwoCols>
              <SubmitButton variant="outline" pendingText="保存中">保存修改</SubmitButton>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Hooks({ project }: { project: ProjectDetail }) {
  const hook = project.hookPackages[0];
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
      )}
    </div>
  );
}

function Characters({ project }: { project: ProjectDetail }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-lg font-semibold">人物设定</h2>
        <WorkflowButton projectId={project.id} type="generate_outline" tab="characters">
          生成人物与大纲
        </WorkflowButton>
      </div>
      {project.characters.length === 0 ? <Empty text="还没有人物设定。" /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {project.characters.map((character) => (
          <Card key={character.id}>
            <CardHeader>
              <h3 className="font-semibold">{character.name}</h3>
              <p className="text-sm text-zinc-600">{character.role} / {character.identity}</p>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm leading-6">
              <Row label="表层目标" value={character.surfaceGoal} />
              <Row label="真实欲望" value={character.trueDesire} />
              <Row label="弱点" value={character.weakness} />
              <Row label="秘密" value={character.secret} />
              <Row label="关系" value={character.relationshipToProtagonist} />
              <Row label="剧情功能" value={character.plotFunction} />
              <Row label="转折" value={character.turningPoint} />
              <Row label="结局" value={character.ending} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Outline({ project }: { project: ProjectDetail }) {
  const outline = project.outlines[0];
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">场景卡片</h2>
          <p className="mt-1 text-sm text-zinc-600">左侧选择场景，右侧编辑当前卡片。</p>
        </div>
        <Badge>{project.sceneCards.length} 张卡片</Badge>
      </div>
      {project.sceneCards.length === 0 ? <Empty text="还没有场景卡。先生成人物与大纲。" /> : null}
      {selectedScene ? (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <SceneDrawer
            project={project}
            tab="scenes"
            selectedSceneId={selectedScene.id}
            segmentBySceneId={segmentBySceneId}
          />
          <SceneEditorCard
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
    <div className="grid gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">正文写作</h2>
          <p className="mt-1 text-sm text-zinc-600">左侧切换场景，右侧写作或查看正文。</p>
        </div>
        <Badge>全文 {totalWords} 字</Badge>
      </div>
      {project.sceneCards.length === 0 && orderedSegments.length === 0 ? (
        <Empty text="还没有正文。去场景卡片里选择一个场景生成。" />
      ) : null}
      {project.sceneCards.length || orderedSegments.length ? (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <SceneDrawer
            project={project}
            tab="writing"
            selectedSceneId={activeSceneId}
            selectedSegmentId={selectedManualSegment?.id}
            segmentBySceneId={segmentBySceneId}
            manualSegments={manualSegments}
          />
          {selectedSegment ? (
            <DraftEditorCard project={project} segment={selectedSegment} scene={selectedScene} />
          ) : selectedScene ? (
            <UnwrittenSceneCard project={project} scene={selectedScene} />
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
  return (
    <aside className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className="h-4 w-4 shrink-0 text-zinc-600" />
          <span className="font-medium text-zinc-950">场景抽屉</span>
        </div>
        <Badge>{project.sceneCards.length}</Badge>
      </div>
      <nav className="max-h-[380px] overflow-y-auto p-2 lg:max-h-[calc(100vh-10rem)]">
        <div className="grid gap-1">
          {project.sceneCards.map((scene) => {
            const segment = segmentBySceneId.get(scene.id);
            const selected = scene.id === selectedSceneId;
            return (
              <Link
                key={scene.id}
                href={projectTabHref(project.id, tab, { sceneId: scene.id })}
                className={cn(
                  "flex min-h-16 gap-3 rounded-md border px-3 py-2 text-left transition",
                  selected
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "border-transparent text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold",
                    selected ? "bg-white text-zinc-950" : "bg-zinc-100 text-zinc-700",
                  )}
                >
                  {scene.orderIndex}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{scene.title}</span>
                  <span className={cn("mt-1 block truncate text-xs", selected ? "text-zinc-200" : "text-zinc-500")}>
                    {segment ? `${segment.wordCount} 字` : "未写正文"} / {readableSceneStatus(scene.status)}
                  </span>
                </span>
              </Link>
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
                  <Link
                    key={segment.id}
                    href={projectTabHref(project.id, "writing", { segmentId: segment.id })}
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 transition",
                      selected
                        ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                        : "border-transparent text-zinc-700 hover:border-zinc-200 hover:bg-zinc-50",
                    )}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{segment.title}</span>
                      <span className={cn("mt-1 block text-xs", selected ? "text-zinc-200" : "text-zinc-500")}>
                        {segment.wordCount} 字 / {readableSceneStatus(segment.status)}
                      </span>
                    </span>
                  </Link>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            {scene.orderIndex}. {scene.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">{scene.conflict}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge>{readableSceneStatus(scene.status)}</Badge>
          {segment ? (
            <Link className={buttonVariants("outline")} href={projectTabHref(project.id, "writing", { sceneId: scene.id })}>
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
        <form action={updateSceneCardAction} className="grid gap-3">
          <input type="hidden" name="id" value={scene.id} />
          <input type="hidden" name="projectId" value={project.id} />
          <TwoCols>
            <Field label="标题"><Input name="title" defaultValue={scene.title} /></Field>
            <Field label="状态"><Input name="status" defaultValue={scene.status} /></Field>
            <Field label="目标"><Textarea name="goal" defaultValue={scene.goal} /></Field>
            <Field label="地点"><Textarea name="location" defaultValue={scene.location} /></Field>
            <Field label="冲突"><Textarea name="conflict" defaultValue={scene.conflict} /></Field>
            <Field label="信息增量"><Textarea name="informationGain" defaultValue={scene.informationGain} /></Field>
            <Field label="情绪变化"><Textarea name="emotionalShift" defaultValue={scene.emotionalShift} /></Field>
            <Field label="回收"><Textarea name="payoff" defaultValue={scene.payoff} /></Field>
            <Field label="必须包含 JSON"><Textarea name="mustIncludeJson" defaultValue={scene.mustIncludeJson} /></Field>
            <Field label="伏笔 JSON"><Textarea name="foreshadowingJson" defaultValue={scene.foreshadowingJson} /></Field>
            <Field label="禁止 JSON"><Textarea name="forbiddenJson" defaultValue={scene.forbiddenJson} /></Field>
          </TwoCols>
          <SubmitButton variant="outline" pendingText="保存中">保存场景卡</SubmitButton>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{segment.title}</h3>
          <p className="text-sm text-zinc-600">
            {segment.sceneCard?.title ?? "手动段落"} / {segment.wordCount} 字 / {readableSceneStatus(segment.status)}
          </p>
        </div>
        <CopyButton text={segment.content} />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <form action={updateDraftSegmentAction} className="grid gap-3">
              <input type="hidden" name="id" value={segment.id} />
              <input type="hidden" name="projectId" value={project.id} />
              <TwoCols>
                <Field label="标题"><Input name="title" defaultValue={segment.title} /></Field>
                <Field label="状态"><Input name="status" defaultValue={segment.status} /></Field>
              </TwoCols>
              <MarkdownEditor name="content" defaultValue={segment.content} />
              <SubmitButton variant="outline" pendingText="保存中">保存正文版本</SubmitButton>
            </form>
            <SegmentChiefPanel project={project} segment={segment} />
          </div>
          {referenceScene ? <SceneReferencePanel scene={referenceScene} /> : null}
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

function SceneReferencePanel({ scene }: { scene: SceneCardItem }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="mb-3 flex items-center gap-2 font-medium text-zinc-950">
        <BookOpenCheck className="h-4 w-4 text-zinc-600" />
        当前场景卡
      </div>
      <div className="grid gap-3 text-sm leading-6 md:grid-cols-2">
        <MiniRow label="目标" value={scene.goal} />
        <MiniRow label="地点" value={scene.location} />
        <MiniRow label="冲突" value={scene.conflict} />
        <MiniRow label="信息增量" value={scene.informationGain} />
        <MiniRow label="情绪变化" value={scene.emotionalShift} />
        <MiniRow label="回收" value={scene.payoff} />
      </div>
      {scene.mustIncludeJson !== "[]" || scene.foreshadowingJson !== "[]" || scene.forbiddenJson !== "[]" ? (
        <div className="mt-3 grid gap-2 text-xs leading-5 text-zinc-600 md:grid-cols-3">
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
  const chief = safeJsonParse<{
    overallScore?: number;
    summary?: string;
    rewriteInstructions?: string[];
    nextAction?: string;
  }>(segment.chiefDecisionJson, {});
  const action = readableChiefAction(chief.nextAction);
  const currentScene = segment.sceneCard;
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
          {currentScene && chief.nextAction === "rewrite" ? (
            <WorkflowButton projectId={project.id} type="write_scene" tab="writing" sceneCardId={currentScene.id}>
              按意见重写本场
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
  const chiefRuns = project.agentRuns.filter((run) => run.agentName === "ChiefEditorAgent");
  const latestChief = chiefRuns[0];
  const chief = safeJsonParse<{
    overallScore?: number;
    summary?: string;
    coreProblems?: string[];
    acceptedSuggestions?: string[];
    rejectedSuggestions?: string[];
    rewriteInstructions?: string[];
    nextAction?: string;
  }>(latestChief?.outputJson, {});
  const latestReport = project.reviewReports[0];
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
          {latestChief ? (
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
            <details key={run.id} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {run.agentName} / {run.workflowType} / {run.status} / {formatDate(run.createdAt)}
              </summary>
              {run.error ? <p className="mt-2 text-rose-700">{run.error}</p> : null}
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-xs leading-5">
                {run.outputJson || run.rawOutput || "无输出"}
              </pre>
            </details>
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
              <Field label="关键词"><Input name="keywords" defaultValue={project.keywords} /></Field>
              <Field label="目标字数"><Input name="targetWordCount" type="number" defaultValue={project.targetWordCount} /></Field>
              <Field label="叙事视角"><Input name="pov" defaultValue={project.pov} /></Field>
              <Field label="结局倾向"><Input name="endingPreference" defaultValue={project.endingPreference} /></Field>
              <Field label="情绪基调"><Input name="emotionalTone" defaultValue={project.emotionalTone} /></Field>
            </TwoCols>
            <Field label="原始灵感"><Textarea name="originalIdea" defaultValue={project.originalIdea} /></Field>
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
