import { z } from "zod";
import { prisma } from "@/db/prisma";
import { parseJsonFromModel } from "@/lib/json";
import { stringifyJson } from "@/lib/utils";
import { callChatCompletion, type ChatMessage, type LLMConfig } from "./llmClient";

export type RunAgentInput<TSchema extends z.ZodTypeAny> = {
  projectId?: string;
  workflowType: string;
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  schema: TSchema;
  llmOverrides?: Partial<LLMConfig>;
};

export async function runAgent<TSchema extends z.ZodTypeAny>({
  projectId,
  workflowType,
  agentName,
  systemPrompt,
  userPrompt,
  schema,
  llmOverrides,
}: RunAgentInput<TSchema>): Promise<z.infer<TSchema>> {
  let messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    let rawOutput = "";
    let model: string | undefined;
    let tokenUsage: unknown;

    try {
      const result = await callChatCompletion(messages, llmOverrides);
      rawOutput = result.content;
      model = result.model;
      tokenUsage = result.tokenUsage;
      const parsed = parseJsonFromModel(rawOutput);
      const validated = schema.parse(parsed);

      await prisma.agentRun.create({
        data: {
          projectId,
          workflowType,
          agentName,
          inputJson: stringifyJson({ attempt, messages }),
          outputJson: stringifyJson(validated),
          rawOutput,
          status: "success",
          model,
          durationMs: Date.now() - startedAt,
          tokenUsage: tokenUsage ? stringifyJson(tokenUsage) : undefined,
        },
      });

      return validated;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await prisma.agentRun.create({
        data: {
          projectId,
          workflowType,
          agentName,
          inputJson: stringifyJson({ attempt, messages }),
          outputJson: undefined,
          rawOutput,
          status: "failed",
          error: lastError,
          model,
          durationMs: Date.now() - startedAt,
          tokenUsage: tokenUsage ? stringifyJson(tokenUsage) : undefined,
        },
      });

      if (attempt === 2 || !rawOutput) break;

      messages = [
        ...messages,
        {
          role: "assistant",
          content: rawOutput || "无法生成有效输出。",
        },
        {
          role: "user",
          content:
            "你的上一次输出无法被系统解析或不符合 schema。请只输出一个合法 JSON，对齐上文要求，不要写 Markdown。",
        },
      ];
    }
  }

  throw new Error(`${agentName} 输出解析失败：${lastError}`);
}
