import { prisma } from "@/db/prisma";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const settings = await prisma.lLMSettings.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white/90 px-5 py-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-950">新建故事项目</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          先给 Agent 一个完整的创作简报：题材、时空、人物、关系冲突和读者承诺越清楚，后面的方向、大纲和正文越不容易散。
        </p>
      </div>

      {params.error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {params.error}
        </div>
      ) : null}
      <NewProjectForm
        settings={settings.map((item) => ({
          id: item.id,
          providerName: item.providerName,
          model: item.model,
        }))}
      />
    </main>
  );
}
