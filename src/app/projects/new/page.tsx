import { createProjectAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/form/SubmitButton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/db/prisma";

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

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">创作简报</h2>
        </CardHeader>
        <CardContent>
          <form action={createProjectAction} className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="项目标题">
                <Input name="title" placeholder="留空则自动取灵感前几个字" />
              </Field>
              <Field label="故事类型">
                <select name="genre" className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option>悬疑反转</option>
                  <option>都市情感</option>
                  <option>婚恋复仇</option>
                  <option>职场逆袭</option>
                  <option>家庭伦理</option>
                  <option>古风权谋</option>
                  <option>无限流/规则怪谈</option>
                </select>
              </Field>
              <Field label="关键词">
                <Input name="keywords" placeholder="复仇、婚姻、秘密、身份反转" />
              </Field>
              <Field label="目标字数">
                <Input name="targetWordCount" type="number" defaultValue={8000} />
              </Field>
              <Field label="叙事视角">
                <select name="pov" className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm" defaultValue="第一人称">
                  <option>第一人称</option>
                  <option>第三人称有限视角</option>
                  <option>双视角</option>
                </select>
              </Field>
              <Field label="结局倾向">
                <select name="endingPreference" className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm" defaultValue="反转后清算">
                  <option>反转后清算</option>
                  <option>真相揭开后和解</option>
                  <option>开放式余味</option>
                  <option>爽点复仇完成</option>
                  <option>牺牲换自由</option>
                </select>
              </Field>
              <Field label="情绪基调">
                <select name="emotionalTone" className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm" defaultValue="压迫、反击、情绪释放">
                  <option>压迫、反击、情绪释放</option>
                  <option>暧昧、误会、心碎、补偿</option>
                  <option>窒息、悬疑、真相反转</option>
                  <option>冷静、克制、后劲强</option>
                  <option>高压、爽感、清算</option>
                </select>
              </Field>
              <Field label="AI 模型配置">
                <select
                  name="llmSettingsId"
                  className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                  defaultValue={settings[0]?.id ?? ""}
                >
                  {settings.length === 0 ? <option value="">使用 .env.local 或稍后配置</option> : null}
                  {settings.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.providerName} / {item.model}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="时空背景">
                <select name="timeSpace" className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm" defaultValue="现代都市，婚礼/家庭/职场交错">
                  <option>现代都市，婚礼/家庭/职场交错</option>
                  <option>现代小城，熟人社会与旧案阴影</option>
                  <option>古代宅院，家族权力与婚姻交易</option>
                  <option>近未来城市，身份系统与隐私失控</option>
                  <option>封闭空间，规则限制与倒计时危机</option>
                </select>
              </Field>
              <Field label="人物预设">
                <Input name="protagonistProfile" defaultValue="主角表面被动，实际有观察力和反击底牌" />
              </Field>
              <Field label="关系/冲突">
                <Input name="relationshipCore" defaultValue="亲密关系里有人隐瞒关键事实，主角被迫做选择" />
              </Field>
              <Field label="读者承诺">
                <Input name="plotPromise" defaultValue="开局有压迫感，中段持续误导，结尾反转清算" />
              </Field>
              <Field label="预置标签">
                <Input name="presetTags" defaultValue="强钩子、快节奏、伏笔回收、情绪释放" />
              </Field>
            </div>
            <Field label="原始灵感">
              <Textarea
                name="originalIdea"
                placeholder="一句话也可以，例如：我在婚礼当天发现未婚夫给我的请柬是假的。"
              />
            </Field>
            <Field label="禁止事项">
              <Textarea name="forbiddenItems" placeholder="不写血腥细节；不写未成年人伤害；不写过度狗血等。" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingText="创建中">创建项目</SubmitButton>
              <span className="text-sm text-zinc-500">创建后会进入项目工作台，先生成故事方向。</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
