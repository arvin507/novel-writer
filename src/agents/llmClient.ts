import { prisma } from "@/db/prisma";
import { decryptSecret } from "@/lib/encryption";

export type ApiMode = "chat_completions" | "responses";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMConfig = {
  providerName: string;
  apiMode: ApiMode;
  reasoningEffort: ReasoningEffort;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  stream: boolean;
};

export type ChatCompletionResult = {
  content: string;
  model?: string;
  tokenUsage?: unknown;
  raw: unknown;
};

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBoolean(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function normalizeApiMode(value: unknown): ApiMode {
  return value === "responses" ? "responses" : "chat_completions";
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  return ["none", "minimal", "low", "medium", "high", "xhigh"].includes(String(value))
    ? (value as ReasoningEffort)
    : "high";
}

export async function getLLMConfig(): Promise<LLMConfig> {
  const saved = await prisma.lLMSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (saved?.baseUrl && saved.model) {
    return {
      providerName: saved.providerName,
      apiMode: normalizeApiMode(saved.apiMode),
      reasoningEffort: normalizeReasoningEffort(saved.reasoningEffort),
      baseUrl: saved.baseUrl,
      apiKey: decryptSecret(saved.apiKeyEncrypted),
      model: saved.model,
      temperature: saved.temperature,
      maxTokens: saved.maxTokens,
      timeout: saved.timeout,
      stream: saved.streamEnabled,
    };
  }

  return {
    providerName: "OpenAI Compatible",
    apiMode: normalizeApiMode(process.env.OPENAI_COMPATIBLE_API_MODE),
    reasoningEffort: normalizeReasoningEffort(process.env.OPENAI_COMPATIBLE_REASONING_EFFORT),
    baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || "",
    apiKey: process.env.OPENAI_COMPATIBLE_API_KEY || "",
    model: process.env.OPENAI_COMPATIBLE_MODEL || "",
    temperature: envNumber("OPENAI_COMPATIBLE_TEMPERATURE", 0.7),
    maxTokens: envNumber("OPENAI_COMPATIBLE_MAX_TOKENS", 4000),
    timeout: envNumber("OPENAI_COMPATIBLE_TIMEOUT", 180000),
    stream: envBoolean("OPENAI_COMPATIBLE_STREAM", false),
  };
}

export async function callChatCompletion(
  messages: ChatMessage[],
  overrides: Partial<LLMConfig> = {},
): Promise<ChatCompletionResult> {
  const baseConfig = await getLLMConfig();
  const config = { ...baseConfig, ...overrides };

  if (!config.baseUrl) throw new Error("尚未配置 Base URL。");
  if (!config.apiKey) throw new Error("尚未配置 API Key。");
  if (!config.model) throw new Error("尚未配置模型名称。");

  return config.apiMode === "responses"
    ? callResponsesApi(messages, config)
    : callChatCompletionsApi(messages, config);
}

async function callChatCompletionsApi(
  messages: ChatMessage[],
  config: LLMConfig,
): Promise<ChatCompletionResult> {
  const endpoint = buildEndpoint(config.baseUrl, "chat/completions");
  const payload = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false,
  };

  const raw = await postJson(endpoint, config, payload);
  const responsePayload = raw as {
    model?: string;
    usage?: unknown;
    choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
  };
  const content =
    responsePayload.choices?.[0]?.message?.content ?? responsePayload.choices?.[0]?.delta?.content;

  if (!content) {
    throw new Error("第三方 API 返回格式不兼容：未找到 choices[0].message.content。");
  }

  return {
    content,
    model: responsePayload.model ?? config.model,
    tokenUsage: responsePayload.usage,
    raw,
  };
}

async function callResponsesApi(
  messages: ChatMessage[],
  config: LLMConfig,
): Promise<ChatCompletionResult> {
  const endpoint = buildEndpoint(config.baseUrl, "responses");
  const { instructions, input } = splitResponsesInput(messages);
  const payload: Record<string, unknown> = {
    model: config.model,
    input,
    reasoning: { effort: config.reasoningEffort },
    temperature: config.temperature,
    max_output_tokens: config.maxTokens,
    stream: config.stream,
    store: false,
  };

  if (instructions) payload.instructions = instructions;

  if (config.stream) {
    return postResponsesStream(endpoint, config, payload);
  }

  const raw = await postJson(endpoint, config, payload);
  const responsePayload = raw as {
    model?: string;
    usage?: unknown;
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  const content = extractResponsesText(responsePayload);

  if (!content) {
    throw new Error("Responses API 返回格式不兼容：未找到 output_text 或 output[].content[].text。");
  }

  return {
    content,
    model: responsePayload.model ?? config.model,
    tokenUsage: responsePayload.usage,
    raw,
  };
}

async function postJson(endpoint: string, config: LLMConfig, payload: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout);

  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
      ) {
        throw new Error(
          `AI 请求超时：超过 ${Math.round(config.timeout / 1000)} 秒没有返回。可以降低 Max Tokens，或把任务拆小。`,
        );
      }
      throw error;
    }

    const rawText = await response.text();
    let raw: unknown = rawText;
    try {
      raw = JSON.parse(rawText);
    } catch {
      // Some compatible providers return HTML or plain text for upstream errors.
    }

    if (!response.ok) {
      if (response.status === 524) {
        throw new Error(
          "AI 网关超时：供应商在模型返回前断开了请求。请降低 Max Tokens，或稍后重试。",
        );
      }
      throw new Error(formatHttpError(response.status, rawText, endpoint));
    }

    return raw;
  } finally {
    clearTimeout(timer);
  }
}

async function postResponsesStream(
  endpoint: string,
  config: LLMConfig,
  payload: unknown,
): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), config.timeout);
  };
  resetTimer();

  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
      ) {
        throw new Error(
          `AI 流式请求超时：超过 ${Math.round(config.timeout / 1000)} 秒没有收到新数据。可以降低推理强度、降低 Max Tokens，或稍后重试。`,
        );
      }
      throw error;
    }

    if (!response.ok) {
      const rawText = await response.text();
      if (response.status === 524) {
        throw new Error(
          "AI 网关超时：供应商在模型返回前断开了请求。请降低推理强度或 Max Tokens，或稍后重试。",
        );
      }
      throw new Error(formatHttpError(response.status, rawText, endpoint));
    }

    if (!response.body) {
      throw new Error("Responses API 流式返回为空：没有可读取的响应体。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    const eventTypes: string[] = [];
    let buffer = "";
    let completedResponse: unknown;

    const handleEvent = (event: unknown) => {
      if (!event || typeof event !== "object") return;
      const payload = event as {
        type?: string;
        delta?: string;
        text?: string;
        response?: unknown;
        error?: { message?: string } | string;
      };

      if (payload.type) eventTypes.push(payload.type);
      if (payload.error) {
        const message =
          typeof payload.error === "string" ? payload.error : payload.error.message ?? "未知错误";
        throw new Error(`Responses API 流式返回错误：${message}`);
      }
      if (payload.type === "response.output_text.delta" && typeof payload.delta === "string") {
        chunks.push(payload.delta);
      }
      if (payload.type === "response.completed") {
        completedResponse = payload.response ?? event;
      }
      if (payload.type === "response.failed" || payload.type === "response.incomplete") {
        completedResponse = payload.response ?? event;
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetTimer();
        buffer += decoder.decode(value, { stream: true });
        buffer = consumeSseEvents(buffer, handleEvent);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
      ) {
        throw new Error(
          `AI 流式请求超时：超过 ${Math.round(config.timeout / 1000)} 秒没有收到新数据。可以降低推理强度、降低 Max Tokens，或稍后重试。`,
        );
      }
      throw error;
    }
    buffer += decoder.decode();
    consumeSseEvents(`${buffer}\n\n`, handleEvent);

    const streamedContent = chunks.join("").trim();
    const completedPayload = completedResponse as
      | {
          model?: string;
          usage?: unknown;
          output_text?: string;
          output?: Array<{ content?: Array<{ text?: string }> }>;
        }
      | undefined;
    const fallbackContent = completedPayload ? extractResponsesText(completedPayload) : "";
    const content = streamedContent || fallbackContent;

    if (!content) {
      throw new Error("Responses API 流式返回格式不兼容：未找到 output_text delta。");
    }

    return {
      content,
      model: completedPayload?.model ?? config.model,
      tokenUsage: completedPayload?.usage,
      raw: {
        stream: true,
        eventTypes,
        completedResponse,
      },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function consumeSseEvents(buffer: string, onEvent: (event: unknown) => void) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    const data = part
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    onEvent(JSON.parse(data));
  }

  return rest;
}

function buildEndpoint(baseUrl: string, path: "chat/completions" | "responses") {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return normalizedBaseUrl.endsWith("/v1")
    ? `${normalizedBaseUrl}/${path}`
    : `${normalizedBaseUrl}/v1/${path}`;
}

function formatHttpError(status: number, rawText: string, endpoint: string) {
  const endpointLabel = formatEndpoint(endpoint);
  const htmlTitle = extractHtmlTitle(rawText);
  const textSummary =
    htmlTitle ||
    rawText
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);

  if (status === 502) {
    return [
      `AI 网关返回 502 Bad Gateway：${endpointLabel}`,
      "上游服务不可用、接口路径不支持，或模型暂时不可用。",
      textSummary ? `网关信息：${textSummary}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [`AI 请求失败：HTTP ${status} ${endpointLabel}`, textSummary].filter(Boolean).join(" ");
}

function extractHtmlTitle(rawText: string) {
  const titleStart = rawText.toLowerCase().indexOf("<title>");
  const titleEnd = rawText.toLowerCase().indexOf("</title>", titleStart);
  if (titleStart === -1 || titleEnd === -1) return "";
  return rawText.slice(titleStart + "<title>".length, titleEnd).replace(/\s+/g, " ").trim();
}

function formatEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.origin}${url.pathname}`;
  } catch {
    return endpoint;
  }
}

function splitResponsesInput(messages: ChatMessage[]) {
  const systemMessages = messages.filter((message) => message.role === "system");
  const inputMessages = messages.filter((message) => message.role !== "system");
  return {
    instructions: systemMessages.map((message) => message.content).join("\n\n"),
    input: inputMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };
}

function extractResponsesText(payload: {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
}) {
  if (payload.output_text) return payload.output_text;
  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("")
    .trim();
}

export async function testLLMConnection(config: LLMConfig) {
  const result = await callChatCompletion(
    [
      {
        role: "user",
        content: '请只回复一个 JSON：{"ok":true,"message":"connected"}',
      },
    ],
    config,
  );
  return result.content;
}
