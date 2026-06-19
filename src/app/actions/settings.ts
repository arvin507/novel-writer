"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/encryption";
import { testLLMConnection, type LLMConfig } from "@/agents/llmClient";

const settingsSchema = z.object({
  providerName: z.string().default("OpenAI Compatible"),
  apiMode: z.enum(["chat_completions", "responses"]).default("chat_completions"),
  reasoningEffort: z
    .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
    .default("high"),
  baseUrl: z.string().trim().min(1, "Base URL 必填"),
  apiKey: z.string().optional().default(""),
  model: z.string().trim().min(1, "模型名称必填"),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
  maxTokens: z.coerce.number().min(1).max(200000).default(4000),
  timeout: z.coerce.number().min(1000).max(300000).default(180000),
  streamEnabled: z.coerce.boolean().default(false),
});

const testSettingsSchema = settingsSchema.extend({
  baseUrl: z.string().trim().optional().default(""),
  model: z.string().trim().optional().default(""),
});

function redirectWithSettingsError(error: unknown): never {
  const message =
    error instanceof z.ZodError
      ? error.issues.map((issue) => issue.message).join("；")
      : error instanceof Error
        ? error.message
        : String(error);
  redirect(`/settings?status=test-failed&message=${encodeURIComponent(message)}`);
}

export async function saveLLMSettingsAction(formData: FormData) {
  const result = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    redirectWithSettingsError(result.error);
  }

  const parsed = result.data;
  const existing = await prisma.lLMSettings.findFirst({ orderBy: { updatedAt: "desc" } });
  const apiKeyEncrypted =
    parsed.apiKey.trim() || !existing
      ? encryptSecret(parsed.apiKey.trim())
      : existing.apiKeyEncrypted;

  if (existing) {
    await prisma.lLMSettings.update({
      where: { id: existing.id },
      data: {
        providerName: parsed.providerName,
        apiMode: parsed.apiMode,
        reasoningEffort: parsed.reasoningEffort,
        baseUrl: parsed.baseUrl,
        apiKeyEncrypted,
        model: parsed.model,
        temperature: parsed.temperature,
        maxTokens: parsed.maxTokens,
        timeout: parsed.timeout,
        streamEnabled: parsed.streamEnabled,
      },
    });
  } else {
    await prisma.lLMSettings.create({
      data: {
        providerName: parsed.providerName,
        apiMode: parsed.apiMode,
        reasoningEffort: parsed.reasoningEffort,
        baseUrl: parsed.baseUrl,
        apiKeyEncrypted,
        model: parsed.model,
        temperature: parsed.temperature,
        maxTokens: parsed.maxTokens,
        timeout: parsed.timeout,
        streamEnabled: parsed.streamEnabled,
      },
    });
  }

  redirect("/settings?status=saved");
}

export async function testLLMSettingsAction(formData: FormData) {
  const result = testSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    redirectWithSettingsError(result.error);
  }

  const parsed = result.data;
  const existing = await prisma.lLMSettings.findFirst({ orderBy: { updatedAt: "desc" } });
  const baseUrl = parsed.baseUrl || existing?.baseUrl || process.env.OPENAI_COMPATIBLE_BASE_URL || "";
  const model = parsed.model || existing?.model || process.env.OPENAI_COMPATIBLE_MODEL || "";
  const config: LLMConfig = {
    providerName: parsed.providerName,
    apiMode: parsed.apiMode || (existing?.apiMode === "responses" ? "responses" : "chat_completions"),
    reasoningEffort: parsed.reasoningEffort,
    baseUrl,
    apiKey: parsed.apiKey.trim() || (existing ? decryptSecret(existing.apiKeyEncrypted) : ""),
    model,
    temperature: parsed.temperature,
    maxTokens: Math.min(parsed.maxTokens, 1000),
    timeout: parsed.timeout,
    stream: parsed.streamEnabled,
  };

  try {
    await testLLMConnection(config);
  } catch (error) {
    redirectWithSettingsError(error);
  }

  redirect("/settings?status=test-ok");
}
