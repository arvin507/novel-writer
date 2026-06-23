import { AlertCircle, CheckCircle2 } from "lucide-react";
import { saveLLMSettingsAction, testLLMSettingsAction } from "@/app/actions/settings";
import { SubmitButton } from "@/components/form/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prisma } from "@/db/prisma";
import { decryptSecret, maskSecret } from "@/lib/encryption";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; message?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const settings = await prisma.lLMSettings.findFirst({ orderBy: { updatedAt: "desc" } });
  const maskedKey = settings ? maskSecret(decryptSecret(settings.apiKeyEncrypted)) : "未配置";

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">本地 AI 设置</h1>
          <p className="mt-2 text-sm text-zinc-600">
            配置第三方 OpenAI-compatible 接口。API Key 只保存在本地 SQLite。
          </p>
        </div>
        <Badge>Key：{maskedKey}</Badge>
      </div>

      {params.status === "saved" ? (
        <Notice icon="ok" text="设置已保存。" />
      ) : params.status === "test-ok" ? (
        <Notice icon="ok" text="API 连通性测试通过。" />
      ) : params.status === "test-failed" ? (
        <Notice icon="error" text={`测试失败：${params.message ?? ""}`} />
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Provider 配置</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5" action={saveLLMSettingsAction}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Provider 名称">
                <Input name="providerName" defaultValue={settings?.providerName ?? "OpenAI Compatible"} />
              </Field>
              <Field label="API 模式">
                <select
                  name="apiMode"
                  className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                  defaultValue={settings?.apiMode ?? "chat_completions"}
                >
                  <option value="chat_completions">Chat Completions</option>
                  <option value="responses">Responses</option>
                </select>
              </Field>
              <Field label="推理强度">
                <select
                  name="reasoningEffort"
                  className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                  defaultValue={
                    settings?.reasoningEffort ??
                    process.env.OPENAI_COMPATIBLE_REASONING_EFFORT ??
                    "high"
                  }
                >
                  <option value="none">None：最低延迟</option>
                  <option value="minimal">Minimal：极轻推理</option>
                  <option value="low">Low：较快</option>
                  <option value="medium">Medium：均衡</option>
                  <option value="high">High：复杂 Agent 任务</option>
                  <option value="xhigh">XHigh：最强但更慢</option>
                </select>
              </Field>
              <Field label="模型名称">
                <Input name="model" defaultValue={settings?.model ?? process.env.OPENAI_COMPATIBLE_MODEL ?? ""} />
              </Field>
            </div>
            <Field label="Base URL">
              <Input
                name="baseUrl"
                placeholder="https://example.com 或 https://example.com/responses"
                defaultValue={settings?.baseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL ?? ""}
              />
            </Field>
            <Field label="API Key">
              <Input name="apiKey" type="password" placeholder={settings ? "留空则沿用已保存 Key" : "sk-..."} />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Temperature">
                <Input
                  name="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  defaultValue={settings?.temperature ?? process.env.OPENAI_COMPATIBLE_TEMPERATURE ?? 0.7}
                />
              </Field>
              <Field label="Max Tokens">
                <Input
                  name="maxTokens"
                  type="number"
                  min="1"
                  defaultValue={settings?.maxTokens ?? process.env.OPENAI_COMPATIBLE_MAX_TOKENS ?? 4000}
                />
              </Field>
              <Field label="Timeout(ms)">
                <Input name="timeout" type="number" min="1000" defaultValue={settings?.timeout ?? 180000} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="streamEnabled"
                defaultChecked={
                  settings?.streamEnabled ??
                  ["1", "true", "yes", "on"].includes(
                    (process.env.OPENAI_COMPATIBLE_STREAM ?? "").toLowerCase(),
                  )
                }
                className="h-4 w-4 rounded border-zinc-300"
              />
              启用 Responses 流式返回（减少长任务空等超时；Chat Completions 模式会忽略）
            </label>
            <div className="flex flex-wrap gap-2">
              <SubmitButton pendingText="保存中">保存设置</SubmitButton>
              <button
                formAction={testLLMSettingsAction}
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                测试 API
              </button>
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

function Notice({ icon, text }: { icon: "ok" | "error"; text: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
      {icon === "ok" ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : (
        <AlertCircle className="h-4 w-4 text-rose-600" />
      )}
      <span>{text}</span>
    </div>
  );
}
