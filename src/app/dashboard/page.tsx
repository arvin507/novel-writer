import Link from "next/link";
import { Archive, FilePlus2, Search, Trash2 } from "lucide-react";
import {
  archiveProjectAction,
  deleteProjectAction,
  restoreProjectAction,
} from "@/app/actions/projects";
import { SubmitButton } from "@/components/form/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prisma } from "@/db/prisma";
import { readableStage } from "@/lib/storyWorkflow";
import { cn, formatDate } from "@/lib/utils";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; archived?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const q = params.q?.trim() ?? "";
  const showArchived = params.archived === "1";
  const projects = await prisma.project.findMany({
    where: {
      archivedAt: showArchived ? { not: null } : null,
      OR: q
        ? [
            { title: { contains: q } },
            { genre: { contains: q } },
            { keywords: { contains: q } },
            { originalIdea: { contains: q } },
          ]
        : undefined,
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-zinc-200 bg-white/90 px-5 py-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">项目</h1>
          <p className="mt-2 text-sm text-zinc-600">本地短篇故事项目列表。继续写、审稿、导出都从这里进入。</p>
        </div>
        <Link className={buttonVariants("primary")} href="/projects/new">
          <FilePlus2 className="h-4 w-4" />
          新建故事
        </Link>
      </div>

      <form className="mb-4 flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white/90 p-3 shadow-sm md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <Input name="q" defaultValue={q} placeholder="搜索标题、类型、关键词、灵感" className="pl-9" />
        </div>
        <input type="hidden" name="archived" value={showArchived ? "1" : "0"} />
        <button className={buttonVariants("outline")} type="submit">
          搜索
        </button>
        <Link
          className={buttonVariants("ghost")}
          href={showArchived ? "/dashboard" : "/dashboard?archived=1"}
        >
          {showArchived ? "查看进行中" : "查看归档"}
        </Link>
      </form>

      <div className="grid gap-3">
        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-zinc-500">
              暂无项目。先新建一个故事，把灵感扔进去。
            </CardContent>
          </Card>
        ) : (
          projects.map((project) => (
            <Card key={project.id} className="transition hover:border-zinc-300 hover:shadow-md">
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-base font-semibold text-zinc-950 hover:underline"
                    >
                      {project.title}
                    </Link>
                    <Badge className="border-teal-200 bg-teal-50 text-teal-900">{readableStage(project.currentStage)}</Badge>
                    {project.archivedAt ? <Badge className="border-amber-200 bg-amber-50">已归档</Badge> : null}
                  </div>
                  <div className="grid gap-1 text-sm text-zinc-600 md:grid-cols-4">
                    <span>类型：{project.genre}</span>
                    <span>字数：{project.targetWordCount}</span>
                    <span>关键词：{project.keywords || "-"}</span>
                    <span>更新：{formatDate(project.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className={buttonVariants("outline")} href={`/projects/${project.id}`}>
                    查看
                  </Link>
                  <form action={project.archivedAt ? restoreProjectAction : archiveProjectAction}>
                    <input type="hidden" name="id" value={project.id} />
                    <SubmitButton variant="outline" pendingText="处理中">
                      <Archive className="h-4 w-4" />
                      {project.archivedAt ? "恢复" : "归档"}
                    </SubmitButton>
                  </form>
                  <form action={deleteProjectAction}>
                    <input type="hidden" name="id" value={project.id} />
                    <button
                      className={cn(buttonVariants("danger"), "bg-white text-rose-700 hover:bg-rose-50")}
                      type="submit"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
