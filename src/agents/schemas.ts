import { z } from "zod";
import { storyScoreSchema } from "@/lib/scoring/storyScoring";

const flexibleString = z.preprocess((value) => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}, z.string());

export const storyDirectionSchema = z.object({
  title: z.string(),
  logline: z.string(),
  openingHook: z.string(),
  coreConflict: z.string(),
  protagonistDilemma: z.string(),
  mainTwist: z.string(),
  emotionalValue: z.string(),
  targetReaders: z.string(),
  commercialScore: z.coerce.number().min(0).max(100),
  risk: z.string(),
  recommendationReason: z.string(),
});

export const topicPlannerSchema = z.object({
  directions: z.array(storyDirectionSchema).min(3).max(8),
});

export const hookEditorSchema = z.object({
  titles: z.array(z.string()).min(5),
  loglines: z.array(z.string()).min(3),
  openingHooks: z.array(z.string()).min(3),
  openingSamples: z.array(z.string()).min(1),
  recommendation: z.string().optional().default(""),
});

export const characterSchema = z.object({
  name: z.string(),
  role: z.string(),
  identity: z.string(),
  surfaceGoal: z.string(),
  trueDesire: z.string(),
  weakness: z.string(),
  secret: z.string(),
  relationshipToProtagonist: z.string(),
  plotFunction: z.string(),
  turningPoint: z.string(),
  ending: z.string(),
});

export const characterDesignerSchema = z.object({
  characters: z.array(characterSchema).min(2),
});

export const sceneCardSchema = z.object({
  title: z.string(),
  goal: z.string(),
  characters: z.array(z.string()).default([]),
  location: z.string(),
  conflict: z.string(),
  informationGain: z.string(),
  emotionalShift: z.string(),
  mustInclude: z.array(z.string()).default([]),
  foreshadowing: z.array(z.string()).default([]),
  payoff: z.string(),
  forbidden: z.array(z.string()).default([]),
});

export const plotArchitectSchema = z.object({
  storyArc: z.string(),
  outline: z.array(z.string()).min(1),
  sceneCards: z.array(sceneCardSchema).min(1),
  foreshadowingMap: z.array(
    z.object({
      clue: z.string(),
      setupScene: z.string(),
      payoffScene: z.string(),
      note: z.string().optional().default(""),
    }),
  ),
  twistMap: z.array(
    z.object({
      title: z.string(),
      setup: z.string(),
      reveal: z.string(),
      impact: z.string(),
    }),
  ),
  conflictEscalation: z.string(),
  emotionalCurve: z.array(z.string()).default([]),
});

export const criticSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["low", "medium", "high"]).default("medium"),
      problem: z.string(),
      suggestion: z.string(),
    }),
  ),
  scores: storyScoreSchema.partial().default({}),
});

export const readerSchema = z.object({
  wantToContinue: z.array(z.string()).default([]),
  wantToQuit: z.array(z.string()).default([]),
  openingGrab: z.string(),
  paywallEffectiveness: z.string(),
  boringParts: z.array(z.string()).default([]),
  completionRisk: z.string(),
  summary: z.string(),
  scores: storyScoreSchema.partial().default({}),
});

export const chiefEditorSchema = z.object({
  overallScore: z.coerce.number().min(0).max(100),
  summary: flexibleString,
  coreProblems: z.array(flexibleString),
  acceptedSuggestions: z.array(flexibleString),
  rejectedSuggestions: z.array(flexibleString),
  rewriteInstructions: z.array(flexibleString),
  nextAction: z.enum(["approve", "rewrite", "regenerate", "ask_user"]),
  reason: flexibleString,
});

export const draftWriterSchema = z.object({
  title: z.string(),
  content: z.string(),
  selfCheck: z.string().optional().default(""),
});

export const rewriteSchema = z.object({
  rewrittenContent: z.string(),
  changedPoints: z.array(z.string()).default([]),
});

export const polishSchema = z.object({
  polishedContent: z.string(),
  report: z.string(),
});

export const continuitySchema = z.object({
  summary: z.string(),
  previousSummary: z.string(),
  happenedEvents: z.array(z.string()).default([]),
  revealedSecrets: z.array(z.string()).default([]),
  unrevealedSecrets: z.array(z.string()).default([]),
  openForeshadowing: z.array(z.string()).default([]),
  resolvedForeshadowing: z.array(z.string()).default([]),
  characterStates: z.record(z.string(), z.string()).default({}),
  timeline: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  scores: storyScoreSchema.partial().default({}),
});

export type TopicPlannerOutput = z.infer<typeof topicPlannerSchema>;
export type HookEditorOutput = z.infer<typeof hookEditorSchema>;
export type CharacterDesignerOutput = z.infer<typeof characterDesignerSchema>;
export type PlotArchitectOutput = z.infer<typeof plotArchitectSchema>;
export type ChiefEditorOutput = z.infer<typeof chiefEditorSchema>;
