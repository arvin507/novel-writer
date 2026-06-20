import { prisma } from "../src/db/prisma";
import { topicPlannerSchema } from "../src/agents/schemas";
import { buildPlatformInstruction } from "../src/lib/platforms";
import { scoreHints } from "../src/lib/scoring/storyScoring";

async function main() {
  topicPlannerSchema.parse({
    directions: [
      {
        title: "婚礼当天，我收到一张假请柬",
        logline: "女主在婚礼当天发现自己不是新娘，而是被安排来背锅的人。",
        openingHook: "司仪念出新娘名字时，全场看向的人不是我。",
        coreConflict: "亲密关系背叛与身份骗局。",
        protagonistDilemma: "揭穿真相会毁掉母亲唯一的救命钱。",
        mainTwist: "真正操盘的人是女主一直保护的家人。",
        emotionalValue: "压迫后的反击与清算。",
        targetReaders: "喜欢婚恋反转和复仇爽感的读者。",
        commercialScore: 86,
        risk: "狗血度需要控制。",
        recommendationReason: "开场强冲突，反转空间足。",
      },
      {
        title: "备用方向",
        logline: "备用",
        openingHook: "备用",
        coreConflict: "备用",
        protagonistDilemma: "备用",
        mainTwist: "备用",
        emotionalValue: "备用",
        targetReaders: "备用",
        commercialScore: 80,
        risk: "备用",
        recommendationReason: "备用",
      },
      {
        title: "备用方向二",
        logline: "备用",
        openingHook: "备用",
        coreConflict: "备用",
        protagonistDilemma: "备用",
        mainTwist: "备用",
        emotionalValue: "备用",
        targetReaders: "备用",
        commercialScore: 80,
        risk: "备用",
        recommendationReason: "备用",
      },
    ],
  });

  const hints = scoreHints({
    HookScore: 70,
    LogicScore: 90,
    EmotionScore: 60,
    ContinuityScore: 80,
    PublishReadinessScore: 70,
  });

  if (hints.length !== 4) {
    throw new Error("评分提示数量不正确。");
  }

  const zhihuInstruction = buildPlatformInstruction({
    targetPlatform: "zhihu_yanxuan",
    targetWordCount: 8000,
  });
  if (!zhihuInstruction.includes("导语 + 数字分节") || !zhihuInstruction.includes("不要写小标题")) {
    throw new Error("知乎平台格式要求缺失。");
  }

  const project = await prisma.project.create({
    data: {
      title: "smoke-test",
      genre: "测试",
      keywords: "test",
      targetWordCount: 8000,
      targetPlatform: "fanqie_short_story",
      platformRequirementOverride: "测试补充要求",
      pov: "第一人称",
      endingPreference: "反转",
      emotionalTone: "紧张",
      originalIdea: "测试灵感",
      forbiddenItems: "",
    },
  });

  await prisma.project.delete({ where: { id: project.id } });
  await prisma.$disconnect();
  console.log("Smoke test passed.");
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exitCode = 1;
});
