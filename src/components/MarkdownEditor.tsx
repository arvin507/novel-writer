"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Textarea } from "@/components/ui/textarea";

export function MarkdownEditor({
  name,
  defaultValue,
  minHeight = 360,
}: {
  name: string;
  defaultValue: string;
  minHeight?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/50">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50/80 px-2 py-2">
        <div className="flex gap-1 rounded-md bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`rounded-md px-3 py-1 text-sm transition ${
              mode === "edit" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950"
            }`}
          >
            编辑
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`rounded-md px-3 py-1 text-sm transition ${
              mode === "preview" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950"
            }`}
          >
            预览
          </button>
        </div>
        <span className="hidden text-xs text-zinc-400 sm:inline">{value.length} 字符</span>
      </div>
      {mode === "edit" ? (
        <Textarea
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          style={{ minHeight }}
          className="rounded-none border-0 bg-white font-mono focus:ring-0"
        />
      ) : (
        <>
          <input type="hidden" name={name} value={value} />
          <div className="prose prose-zinc max-w-none bg-white p-4 text-sm leading-7">
            <ReactMarkdown>{value || "暂无内容"}</ReactMarkdown>
          </div>
        </>
      )}
    </div>
  );
}
