import { prisma } from "@/db/prisma";
import { buildPlatformInstruction, getPlatformProfile } from "@/lib/platforms";
import { safeJsonParse, stringifyJson, truncateText } from "@/lib/utils";
import { writingRules } from "../prompts";

export async function buildWritingContext(projectId: string, sceneCardId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      storyDirections: { orderBy: { createdAt: "desc" } },
      hookPackages: { orderBy: { createdAt: "desc" }, take: 1 },
      characters: { orderBy: { createdAt: "asc" } },
      storyBible: true,
      sceneCards: { orderBy: { orderIndex: "asc" } },
      draftSegments: {
        orderBy: { createdAt: "asc" },
        include: { sceneCard: true },
      },
    },
  });

  if (!project) throw new Error("项目不存在。");
  const sceneCard = project.sceneCards.find((scene) => scene.id === sceneCardId);
  if (!sceneCard) throw new Error("场景卡不存在。");

  const selectedDirection =
    project.storyDirections.find((item) => item.id === project.selectedDirectionId) ??
    project.storyDirections[0];
  const hookPackage = project.hookPackages[0];
  const previousSceneCard = project.sceneCards.find(
    (scene) => scene.orderIndex === sceneCard.orderIndex - 1,
  );
  const nextSceneCard = project.sceneCards.find((scene) => scene.orderIndex === sceneCard.orderIndex + 1);
  const currentDraft = project.draftSegments.find((segment) => segment.sceneCardId === sceneCard.id);
  const previousDraft = previousSceneCard
    ? project.draftSegments.find((segment) => segment.sceneCardId === previousSceneCard.id)
    : undefined;
  const orderedDraftSegments = project.draftSegments
    .filter((segment) => segment.sceneCard)
    .sort((a, b) => (a.sceneCard?.orderIndex ?? 0) - (b.sceneCard?.orderIndex ?? 0));
  const platformProfile = getPlatformProfile(project.targetPlatform);

  const context = {
    projectBrief: {
      title: project.title,
      genre: project.genre,
      keywords: project.keywords,
      targetWordCount: project.targetWordCount,
      targetPlatform: platformProfile.label,
      platformRequirementOverride: project.platformRequirementOverride,
      pov: project.pov,
      endingPreference: project.endingPreference,
      emotionalTone: project.emotionalTone,
      genreStyleReference: project.genreStyleReference,
      languageStyleReference: project.languageStyleReference,
      originalIdea: project.originalIdea,
      forbiddenItems: project.forbiddenItems,
    },
    styleReference: {
      genreStyleReference: project.genreStyleReference,
      languageStyleReference: project.languageStyleReference,
      instruction:
        "把参考类型风格落实到戏剧推进、冲突组织和爽点/悬念兑现方式；把参考语言风格落实到句子呼吸、对白温度、叙述锋利度和留白。",
    },
    platformInstruction: buildPlatformInstruction(project),
    selectedStoryDirection: selectedDirection
      ? {
          title: selectedDirection.title,
          logline: selectedDirection.logline,
          openingHook: selectedDirection.openingHook,
          coreConflict: selectedDirection.coreConflict,
          protagonistDilemma: selectedDirection.protagonistDilemma,
          mainTwist: selectedDirection.mainTwist,
          emotionalValue: selectedDirection.emotionalValue,
        }
      : null,
    hookPackage: hookPackage
      ? {
          selectedTitle: hookPackage.selectedTitle,
          selectedLogline: hookPackage.selectedLogline,
          selectedHook: hookPackage.selectedHook,
          titles: safeJsonParse<string[]>(hookPackage.titlesJson, []),
          loglines: safeJsonParse<string[]>(hookPackage.loglinesJson, []),
          openingHooks: safeJsonParse<string[]>(hookPackage.openingHooksJson, []),
        }
      : null,
    charactersSummary: project.characters.map((character) => ({
      name: character.name,
      role: character.role,
      identity: character.identity,
      trueDesire: character.trueDesire,
      secret: character.secret,
      plotFunction: character.plotFunction,
      ending: character.ending,
    })),
    storyBible: project.storyBible
      ? {
          previousSummary: project.storyBible.previousSummary,
          happenedEvents: safeJsonParse<string[]>(project.storyBible.happenedEvents, []),
          revealedSecrets: safeJsonParse<string[]>(project.storyBible.revealedSecrets, []),
          unrevealedSecrets: safeJsonParse<string[]>(project.storyBible.unrevealedSecrets, []),
          openForeshadowing: safeJsonParse<string[]>(project.storyBible.openForeshadowing, []),
          resolvedForeshadowing: safeJsonParse<string[]>(
            project.storyBible.resolvedForeshadowing,
            [],
          ),
          characterStates: safeJsonParse<Record<string, string>>(
            project.storyBible.characterStates,
            {},
          ),
          timeline: safeJsonParse<string[]>(project.storyBible.timeline, []),
        }
      : null,
    previousSummary: project.previousSummary,
    continuityGuide: {
      requirement:
        "当前场景必须承接上一场的最后事件、人物状态和情绪余波；不要像独立短文一样重新开局。若 currentDraft 存在，优先根据 currentDraftChiefDecision 改写，而不是从零重写。",
      previousSceneCard: previousSceneCard ? serializeSceneCard(previousSceneCard) : null,
      previousSceneEnding: previousDraft ? truncateText(previousDraft.content.slice(-900), 900) : "",
      nextSceneCard: nextSceneCard ? serializeSceneCard(nextSceneCard) : null,
      currentDraft: currentDraft
        ? {
            title: currentDraft.title,
            status: currentDraft.status,
            content: truncateText(currentDraft.content, 2200),
          }
        : null,
      currentDraftChiefDecision: safeJsonParse<Record<string, unknown>>(
        currentDraft?.chiefDecisionJson,
        {},
      ),
    },
    orderedDraftSegments: orderedDraftSegments.map((segment) => ({
      title: segment.title,
      sceneOrder: segment.sceneCard?.orderIndex,
      content: truncateText(segment.content, 1400),
    })),
    currentSceneCard: serializeSceneCard(sceneCard),
    writingRules,
  };

  return stringifyJson(context);
}

function serializeSceneCard(sceneCard: {
  orderIndex: number;
  title: string;
  goal: string;
  charactersJson: string;
  location: string;
  conflict: string;
  informationGain: string;
  emotionalShift: string;
  mustIncludeJson: string;
  foreshadowingJson: string;
  payoff: string;
  forbiddenJson: string;
}) {
  return {
    orderIndex: sceneCard.orderIndex,
    title: sceneCard.title,
    goal: sceneCard.goal,
    characters: safeJsonParse<string[]>(sceneCard.charactersJson, []),
    location: sceneCard.location,
    conflict: sceneCard.conflict,
    informationGain: sceneCard.informationGain,
    emotionalShift: sceneCard.emotionalShift,
    mustInclude: safeJsonParse<string[]>(sceneCard.mustIncludeJson, []),
    foreshadowing: safeJsonParse<string[]>(sceneCard.foreshadowingJson, []),
    payoff: sceneCard.payoff,
    forbidden: safeJsonParse<string[]>(sceneCard.forbiddenJson, []),
  };
}
