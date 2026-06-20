export const DEFAULT_PLATFORM_KEY = "zhihu_yanxuan";

export type PlatformProfile = {
  key: string;
  label: string;
  shortLabel: string;
  summary: string;
  requirements: string[];
  formatRules: string[];
  styleRules: string[];
  safetyRules: string[];
  sources: string[];
};

export type PlatformProjectLike = {
  targetPlatform?: string | null;
  platformRequirementOverride?: string | null;
  targetWordCount?: number | null;
};

export const platformProfiles = [
  {
    key: "zhihu_yanxuan",
    label: "知乎盐选 / 盐言故事短篇",
    shortLabel: "知乎短篇",
    summary: "适合强导语、强代入、快节奏反转和情绪释放的完整短篇故事。",
    requirements: [
      "当前工作台只按短篇故事处理，不扩展中长篇或长篇连载要求。",
      "短篇投稿口径按全稿不低于 8000 字理解；项目目标字数低于 8000 时，仍可生成练习稿，但需要在输出里避免声称已满足知乎短篇投稿字数。",
      "故事需要人物饱满、情节有共鸣、有价值立意，语言通俗流畅。",
    ],
    formatRules: [
      "正文必须采用“导语 + 数字分节”格式：先写一段导语或引子，然后用单独一行的 1、2、3、4 继续分节。",
      "数字分节下不要写小标题，不要写“第一章”“一、复仇开始”“## 小标题”这类标题。",
      "段落要短，适合手机阅读；开头 50 字内给出异常处境、核心悬念或强情绪钩子。",
      "标题和开篇要像知乎问题/回答里的故事一样，有明确冲突和读者想点开的理由。",
    ],
    styleRules: [
      "优先第一人称或强贴身视角，减少设定说明，把信息放进冲突和行动里。",
      "节奏要快，持续放钩子和信息增量，避免长篇独白、铺垫和复杂理解门槛。",
      "结尾要完成反转、清算、释然或价值回收，让读者获得明确情绪释放。",
    ],
    safetyRules: [
      "避免色情低俗、过度血腥暴力、涉政敏感、封建迷信导向、未成年人不良情节、抄袭洗稿和站外导流。",
      "不要美化违法犯罪、伤害行为或明显不良价值观。",
    ],
    sources: [
      "https://www.zhihu.com/question/530428048",
    ],
  },
  {
    key: "fanqie_short_story",
    label: "番茄小说短故事",
    shortLabel: "番茄短故事",
    summary: "适合强类型、强冲突、爽点或悬念密集、读完率导向的完本短故事。",
    requirements: [
      "当前工作台只按短故事处理，不扩展长篇连载、日更或多卷结构。",
      "按完本短故事准备，建议目标字数不低于 6000 字；需要首尾完整，不能只写连载开头。",
      "输出要便于发布、审核、推荐和数据查看：书名/简介/开篇钩子/正文都要服务读完率。",
    ],
    formatRules: [
      "可以按“标题 + 简介 + 正文分节”组织，分节允许有短标题，但不要展开成长篇章节体系。",
      "正文分节建议控制在 3 到 8 个，每节都承担明确冲突推进或信息反转。",
      "开篇 300 到 800 字内必须亮明主角处境、核心冲突、爽点或悬念，不做慢热铺垫。",
      "每个关键分节末尾保留一个追读钩子，但最终必须完结并回收主要伏笔。",
    ],
    styleRules: [
      "类型标签要清晰，人物目标明确，冲突外化，情绪和爽点要比设定说明更靠前。",
      "减少复杂背景、旁支人物和长段心理解释，优先用行动、对话和反转推进。",
      "结尾完成主线闭环，保留可延展余味即可，不要留下必须靠长篇续写才能解释的坑。",
    ],
    safetyRules: [
      "避免平台常见违规：涉政敏感、色情低俗、恶意导流、抄袭洗稿、过度血腥暴力和不良价值观。",
      "尊重原创，不输出仿写具体在架作品的可识别设定或人物关系。",
    ],
    sources: [
      "https://fanqienovel.com/welfare",
      "https://fanqienovel.com/writer/zone/article/7409917439607062553",
    ],
  },
  {
    key: "general_short_story",
    label: "通用平台短篇",
    shortLabel: "通用短篇",
    summary: "适合先完成一个平台中性的完整短篇，再按目标平台二次改稿。",
    requirements: [
      "当前工作台只按短篇故事处理，不扩展长篇连载要求。",
      "目标是完成一个有开端、发展、高潮和结尾的完整故事，建议 6000 到 30000 字。",
      "所有 Agent 都要优先保证故事闭环、读者承诺兑现、伏笔回收和情绪落点。",
    ],
    formatRules: [
      "默认输出“标题 + 简介 + 正文”，正文可按自然分节组织。",
      "如果项目补充要求指定了平台格式，以补充要求为准。",
      "避免过多层级标题，短篇正文要保持阅读连续性。",
    ],
    styleRules: [
      "开篇尽快给出冲突和悬念，中段持续升级，结尾完成反转或情绪释放。",
      "人物数量、支线和设定密度都要服务短篇篇幅，不做长篇式铺陈。",
    ],
    safetyRules: [
      "避免违法违规、色情低俗、过度血腥暴力、抄袭洗稿和不良价值观。",
    ],
    sources: [],
  },
] as const satisfies readonly PlatformProfile[];

export const platformKeys = platformProfiles.map((profile) => profile.key);

export function isSupportedPlatform(value: string) {
  return platformProfiles.some((profile) => profile.key === value);
}

export function getPlatformProfile(value?: string | null) {
  return (
    platformProfiles.find((profile) => profile.key === value) ??
    platformProfiles.find((profile) => profile.key === DEFAULT_PLATFORM_KEY) ??
    platformProfiles[0]
  );
}

export function buildPlatformInstruction(project?: PlatformProjectLike | null) {
  const profile = getPlatformProfile(project?.targetPlatform);
  const override = project?.platformRequirementOverride?.trim();
  const targetWordCount = project?.targetWordCount ? `${project.targetWordCount} 字` : "未设置";

  const sections = [
    "当前项目平台要求（必须严格遵守）：",
    `平台：${profile.label}`,
    `篇幅模式：短篇故事。当前版本只按短篇处理，不扩展中长篇、长篇连载或系列文策略。`,
    `项目目标字数：${targetWordCount}`,
    "",
    "硬性要求：",
    ...profile.requirements.map((item) => `- ${item}`),
    "",
    "格式要求：",
    ...profile.formatRules.map((item) => `- ${item}`),
    "",
    "风格要求：",
    ...profile.styleRules.map((item) => `- ${item}`),
    "",
    "安全与禁区：",
    ...profile.safetyRules.map((item) => `- ${item}`),
  ];

  if (override) {
    sections.push("", "项目补充要求（优先级高于平台预设，但不能违反安全规则）：", override);
  }

  sections.push(
    "",
    "执行规则：所有选题、标题、人物、大纲、场景卡、正文、审稿和最终润色，都必须按上述平台要求自检；若平台要求与普通写作建议冲突，优先平台硬性要求和安全规则。",
  );

  return sections.join("\n");
}
