import { z } from "zod";

export const storyScoreSchema = z.object({
  HookScore: z.number().min(0).max(100),
  ConflictScore: z.number().min(0).max(100),
  EmotionScore: z.number().min(0).max(100),
  LogicScore: z.number().min(0).max(100),
  PacingScore: z.number().min(0).max(100),
  CharacterScore: z.number().min(0).max(100),
  TwistScore: z.number().min(0).max(100),
  PayoffScore: z.number().min(0).max(100),
  ContinuityScore: z.number().min(0).max(100),
  PublishReadinessScore: z.number().min(0).max(100),
});

export type StoryScores = z.infer<typeof storyScoreSchema>;

export function scoreHints(scores: Partial<StoryScores>) {
  const hints: string[] = [];
  if ((scores.HookScore ?? 100) < 80) hints.push("HookScore 低于 80：建议重新生成钩子。");
  if ((scores.LogicScore ?? 100) < 80) hints.push("LogicScore 低于 80：建议逻辑重审。");
  if ((scores.EmotionScore ?? 100) < 75) hints.push("EmotionScore 低于 75：建议情绪强化。");
  if ((scores.ContinuityScore ?? 100) < 90) hints.push("ContinuityScore 低于 90：建议一致性修复。");
  if ((scores.PublishReadinessScore ?? 100) < 85) {
    hints.push("PublishReadinessScore 低于 85：建议完稿审稿。");
  }
  return hints;
}

export const emptyScores: StoryScores = {
  HookScore: 0,
  ConflictScore: 0,
  EmotionScore: 0,
  LogicScore: 0,
  PacingScore: 0,
  CharacterScore: 0,
  TwistScore: 0,
  PayoffScore: 0,
  ContinuityScore: 0,
  PublishReadinessScore: 0,
};
