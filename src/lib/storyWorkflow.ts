import {
  BookCheck,
  Brush,
  Compass,
  FileText,
  ListChecks,
  PenLine,
  Sparkles,
  Users,
} from "lucide-react";
import type { LocalJobType } from "@/lib/jobs/runner";

export const stageLabels: Record<string, string> = {
  idea: "灵感录入",
  story_directions: "故事方向",
  hooks: "标题钩子",
  characters: "人物设定",
  outline: "大纲场景",
  drafting: "正文写作",
  reviewed: "全文审稿",
  polished: "最终润色",
  archived: "已归档",
  restored: "已恢复",
};

export const sceneStatusLabels: Record<string, string> = {
  unwritten: "待写",
  generating: "生成中",
  draft: "草稿",
  needs_revision: "待修改",
  finalized: "已定稿",
  polished: "已润色",
};

export const chiefActionLabels: Record<string, { label: string; tone: string; hint: string }> = {
  approve: {
    label: "通过",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    hint: "可以继续下一场，或进入全文审稿。",
  },
  rewrite: {
    label: "建议改写",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
    hint: "建议按主编意见重写当前场景或手动调整。",
  },
  regenerate: {
    label: "建议重生成",
    tone: "border-rose-200 bg-rose-50 text-rose-900",
    hint: "当前方向偏差较大，建议重新生成对应内容。",
  },
  ask_user: {
    label: "需要你确认",
    tone: "border-sky-200 bg-sky-50 text-sky-900",
    hint: "需要先补充偏好或取舍，再继续生成。",
  },
};

export const workflowMeta: Record<
  LocalJobType,
  {
    label: string;
    shortLabel: string;
    description: string;
    scope: string;
    icon: typeof Compass;
    nextTab: string;
  }
> = {
  generate_story_directions: {
    label: "生成故事方向",
    shortLabel: "故事方向",
    description: "从原始灵感扩展出多个可选故事路线，并给出推荐依据。",
    scope: "项目早期规划",
    icon: Compass,
    nextTab: "directions",
  },
  generate_hooks: {
    label: "生成标题钩子",
    shortLabel: "标题钩子",
    description: "基于已选方向生成标题、简介、开篇钩子和开头样稿。",
    scope: "标题与开篇包装",
    icon: Sparkles,
    nextTab: "hooks",
  },
  revise_hooks: {
    label: "按主编意见修订钩子",
    shortLabel: "修订钩子",
    description: "保留当前标题钩子包的有效卖点，并按主编结论生成修订版。",
    scope: "标题与开篇包装",
    icon: Sparkles,
    nextTab: "hooks",
  },
  generate_outline: {
    label: "生成人物与大纲",
    shortLabel: "人物大纲",
    description: "生成主要人物、短篇大纲、场景卡、伏笔和反转表。",
    scope: "结构设计",
    icon: Users,
    nextTab: "outline",
  },
  revise_outline: {
    label: "按主编意见修订大纲",
    shortLabel: "修订大纲",
    description: "按主编结论修订当前大纲、场景卡、伏笔和反转表，尽量保留原有场景编号。",
    scope: "结构设计",
    icon: ListChecks,
    nextTab: "outline",
  },
  write_scene: {
    label: "写当前场景",
    shortLabel: "写场景",
    description: "按场景卡写正文，并结合前文、Story Bible 和上一场结尾保持连续。",
    scope: "单个场景",
    icon: PenLine,
    nextTab: "writing",
  },
  revise_scene: {
    label: "按主编意见修订本场",
    shortLabel: "修订本场",
    description: "基于当前正文和本场主编结论修订单个场景，不从零重写。",
    scope: "单个场景",
    icon: PenLine,
    nextTab: "writing",
  },
  review_draft: {
    label: "全文完稿审稿",
    shortLabel: "全文审稿",
    description: "审读所有已写场景，检查逻辑、连续性、情绪曲线和完读风险。",
    scope: "全文",
    icon: BookCheck,
    nextTab: "reviews",
  },
  polish_final_draft: {
    label: "全文最终润色",
    shortLabel: "最终润色",
    description: "在全文审稿基础上润色整篇正文，强化节奏和阅读体验，不改剧情事实。",
    scope: "全文",
    icon: Brush,
    nextTab: "reviews",
  },
};

export const projectMilestones = [
  { key: "directions", label: "方向", icon: Compass },
  { key: "hooks", label: "钩子", icon: Sparkles },
  { key: "characters", label: "人物", icon: Users },
  { key: "outline", label: "大纲", icon: ListChecks },
  { key: "writing", label: "正文", icon: FileText },
  { key: "reviews", label: "审稿", icon: BookCheck },
  { key: "export", label: "导出", icon: Brush },
];

export function readableStage(stage: string) {
  return stageLabels[stage] ?? stage;
}

export function readableSceneStatus(status: string) {
  return sceneStatusLabels[status] ?? status;
}

export function readableChiefAction(action?: string) {
  if (!action) return { label: "暂无结论", tone: "border-zinc-200 bg-zinc-50 text-zinc-700", hint: "" };
  return (
    chiefActionLabels[action] ?? {
      label: action,
      tone: "border-zinc-200 bg-zinc-50 text-zinc-700",
      hint: "",
    }
  );
}
