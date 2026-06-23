"use client";

import { useEffect, useMemo, useState } from "react";
import { createProjectAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/form/SubmitButton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PLATFORM_KEY, platformProfiles } from "@/lib/platforms";

const DRAFT_STORAGE_KEY = "novel-writer:new-project-draft";
const selectClassName = "h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm";

const genreOptions = [
  "悬疑反转",
  "都市情感",
  "婚恋复仇",
  "古言甜宠",
  "古风权谋",
  "江湖探案",
  "宅斗复仇",
  "职场逆袭",
  "家庭伦理",
  "女性成长",
  "真假千金/豪门秘辛",
  "破镜重圆",
  "追妻火葬场",
  "校园暗恋",
  "年代家庭",
  "刑侦悬疑",
  "律政/医疗职业",
  "规则怪谈",
  "无限流/副本求生",
  "赛博悬疑",
  "末日生存",
  "玄幻修仙",
  "快穿系统",
  "轻喜剧治愈",
];

const povOptions = [
  "第一人称",
  "第三人称有限视角",
  "双视角",
  "多视角群像",
  "女主视角",
  "男主视角",
  "旁观者视角",
  "倒叙回忆体",
  "档案/访谈体",
];

const endingOptions = [
  "反转后清算",
  "真相揭开后和解",
  "开放式余味",
  "爽点复仇完成",
  "牺牲换自由",
  "甜宠圆满",
  "破镜重圆",
  "双向救赎",
  "成长后离开",
  "黑色幽默反讽",
  "恶有恶报",
  "BE 余痛",
];

const toneOptions = [
  "压迫、反击、情绪释放",
  "暧昧、误会、心动、补偿",
  "窒息、悬疑、真相反转",
  "轻松、甜爽、治愈",
  "冷静、克制、后劲强",
  "高压、爽感、清算",
  "荒诞、黑色幽默、反讽",
  "紧张、逃生、规则压迫",
  "遗憾、释然、余味",
  "热血、成长、逆袭",
];

const timeSpaceOptions = [
  "现代都市，婚礼/家庭/职场交错",
  "现代小城，熟人社会与旧案阴影",
  "现代校园，暗恋、误会与毕业节点",
  "现代职场，公司权力、利益交换与背锅危机",
  "医院/律所/警局，专业场域与伦理困境",
  "封闭空间，规则限制与倒计时危机",
  "直播/社交平台，舆论反转与身份曝光",
  "古代京城，权贵婚姻与朝堂暗线",
  "古代宅院，家族权力与婚姻交易",
  "古代江湖，身份伪装与旧案追查",
  "民国旧城，家族秘辛与乱世选择",
  "近未来城市，身份系统与隐私失控",
  "赛博都市，记忆交易与公司阴谋",
  "末日废土，资源争夺与信任崩塌",
  "修仙宗门，师徒门规与秘境试炼",
  "无限副本，规则怪谈与生存博弈",
];

const protagonistPresets = [
  "主角表面被动，实际有观察力和反击底牌",
  "主角身份低位，但掌握关键证据",
  "主角被误解多年，终于找到翻案机会",
  "主角嘴硬心软，擅长在危险里装傻",
  "主角有职业技能，能用专业能力破局",
  "主角带着秘密回到旧关系现场",
  "主角看似恋爱脑，实际清醒布局",
];

const relationshipPresets = [
  "亲密关系里有人隐瞒关键事实，主角被迫做选择",
  "敌对两人被迫合作，一边互相试探一边靠近",
  "旧爱重逢，但当年的分开另有隐情",
  "家族/公司把主角当弃子，主角反向借局翻盘",
  "主角和调查者互相怀疑，却必须共享线索",
  "主角被卷入替身/真假身份，关系信任持续崩塌",
];

const promisePresets = [
  "开局有压迫感，中段持续误导，结尾反转清算",
  "高甜互动里埋悬疑，最后用真相补足情感",
  "每一场都有信息增量，结尾回收全部伏笔",
  "先虐后爽，主角从被动受害走向主动掌控",
  "规则不断升级，主角用细节找到生路",
  "轻喜剧开场，后半段转入情绪爆发和关系确认",
];

const genreStylePresets = [
  "强钩子短篇：前三段就给出异常、误会或危险，后续持续抬高代价，结尾完成清算或反转。",
  "悬疑反转风：线索要埋在具体行动和细节里，误导要自然，反转后能倒推成立。",
  "情感拉扯风：关系推进靠试探、误读、补偿和失控，不靠大段自白解释爱恨。",
  "爽文推进风：压迫要具体，反击要主动，清算要有层级，不要一直憋着不爆。",
  "群像博弈风：每个人都带着目的说话做事，场面里始终有利益和权力流动。",
];

const languageStylePresets = [
  "口语化、带火气、少总结。句子允许长短不齐，优先动作、对白、停顿，不写漂亮空话。",
  "冷硬克制。少比喻，少抒情，用细节和反应带出情绪，保留压迫和狼狈感。",
  "贴近短篇网文。节奏快，信息密，段落短，读起来像作者在推现场，不像在写命题作文。",
  "带一点狠劲和羞耻感。人物说话别太体面，允许拧巴、刺痛和欲言又止。",
  "简白直接。尽量不用抽象概念词，能写人怎么做、怎么卡住、怎么失控，就别写感悟。",
];

type SettingsOption = {
  id: string;
  providerName: string;
  model: string;
};

type FormValues = {
  title: string;
  genre: string;
  storyDirectionCount: string;
  keywords: string;
  targetWordCount: string;
  targetPlatform: string;
  pov: string;
  endingPreference: string;
  emotionalTone: string;
  genreStyleReference: string;
  languageStyleReference: string;
  llmSettingsId: string;
  timeSpace: string;
  protagonistProfile: string;
  relationshipCore: string;
  plotPromise: string;
  presetTags: string;
  originalIdea: string;
  platformRequirementOverride: string;
  forbiddenItems: string;
};

export function NewProjectForm({ settings }: { settings: SettingsOption[] }) {
  const defaultLlmSettingsId = useMemo(() => settings[0]?.id ?? "", [settings]);
  const initialDraft = useMemo(() => getInitialDraft(), []);
  const [values, setValues] = useState<FormValues>(() =>
    createInitialFormValues(defaultLlmSettingsId, initialDraft?.values),
  );
  const [restoredAt, setRestoredAt] = useState(initialDraft?.savedAt ?? "");
  const [isDirty, setIsDirty] = useState(Boolean(initialDraft?.values));

  useEffect(() => {
    saveDraft(values);
  }, [values]);

  useEffect(() => {
    if (!isDirty) return undefined;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  function updateField(name: keyof FormValues, value: string) {
    setIsDirty(true);
    setValues((current) => {
      const nextValues = {
        ...current,
        [name]: value,
      };
      saveDraft(nextValues);
      return nextValues;
    });
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setValues(createDefaultFormValues(defaultLlmSettingsId));
    setIsDirty(false);
    setRestoredAt("");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">创作简报</h2>
          <button
            type="button"
            onClick={clearDraft}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-950"
          >
            清空草稿
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {restoredAt ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            已恢复上次未提交的草稿。保存时间：{formatSavedAt(restoredAt)}
          </div>
        ) : null}

        <form action={createProjectAction} className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="项目标题">
              <Input
                name="title"
                value={values.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="留空则自动取灵感前几个字"
              />
            </Field>
            <Field label="故事类型">
              <select
                name="genre"
                className={selectClassName}
                value={values.genre}
                onChange={(event) => updateField("genre", event.target.value)}
              >
                {genreOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Field>
            <Field label="故事方向数量">
              <select
                name="storyDirectionCount"
                className={selectClassName}
                value={values.storyDirectionCount}
                onChange={(event) => updateField("storyDirectionCount", event.target.value)}
              >
                {[1, 2, 3, 4].map((option) => (
                  <option key={option} value={option}>
                    {option} 个
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-zinc-500">
                默认 3 个。短篇方向过多通常会重复，所以这里最多只给到 4 个。
              </p>
            </Field>
            <Field label="关键词">
              <Input
                name="keywords"
                value={values.keywords}
                onChange={(event) => updateField("keywords", event.target.value)}
                placeholder="复仇、婚姻、秘密、身份反转"
              />
            </Field>
            <Field label="目标字数">
              <Input
                name="targetWordCount"
                type="number"
                list="target-word-count-presets"
                value={values.targetWordCount}
                onChange={(event) => updateField("targetWordCount", event.target.value)}
              />
              <datalist id="target-word-count-presets">
                {[6000, 8000, 10000, 12000, 15000, 20000, 30000].map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field label="目标平台">
              <select
                name="targetPlatform"
                className={selectClassName}
                value={values.targetPlatform}
                onChange={(event) => updateField("targetPlatform", event.target.value)}
              >
                {platformProfiles.map((profile) => (
                  <option key={profile.key} value={profile.key}>
                    {profile.label}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-zinc-500">
                当前只按短篇生成；平台格式和风格要求会自动传给每个 Agent。
              </p>
            </Field>
            <Field label="叙事视角">
              <select
                name="pov"
                className={selectClassName}
                value={values.pov}
                onChange={(event) => updateField("pov", event.target.value)}
              >
                {povOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Field>
            <Field label="结局倾向">
              <select
                name="endingPreference"
                className={selectClassName}
                value={values.endingPreference}
                onChange={(event) => updateField("endingPreference", event.target.value)}
              >
                {endingOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Field>
            <Field label="情绪基调">
              <select
                name="emotionalTone"
                className={selectClassName}
                value={values.emotionalTone}
                onChange={(event) => updateField("emotionalTone", event.target.value)}
              >
                {toneOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Field>
            <Field label="参考类型风格">
              <Input
                name="genreStyleReference"
                list="genre-style-presets"
                value={values.genreStyleReference}
                onChange={(event) => updateField("genreStyleReference", event.target.value)}
                placeholder="例如：悬疑反转短篇，线索前置，误导自然，结尾回收伏笔。"
              />
              <datalist id="genre-style-presets">
                {genreStylePresets.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field label="参考语言风格">
              <Input
                name="languageStyleReference"
                list="language-style-presets"
                value={values.languageStyleReference}
                onChange={(event) => updateField("languageStyleReference", event.target.value)}
                placeholder="例如：语言贴近口语，少解释，多现场感，别太整齐。"
              />
              <datalist id="language-style-presets">
                {languageStylePresets.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field label="AI 模型配置">
              <select
                name="llmSettingsId"
                className={selectClassName}
                value={values.llmSettingsId}
                onChange={(event) => updateField("llmSettingsId", event.target.value)}
              >
                {settings.length === 0 ? <option value="">使用 .env.local 或稍后配置</option> : null}
                {settings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.providerName} / {item.model}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="时空背景">
              <select
                name="timeSpace"
                className={selectClassName}
                value={values.timeSpace}
                onChange={(event) => updateField("timeSpace", event.target.value)}
              >
                {timeSpaceOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Field>
            <Field label="人物预设">
              <Input
                name="protagonistProfile"
                list="protagonist-presets"
                value={values.protagonistProfile}
                onChange={(event) => updateField("protagonistProfile", event.target.value)}
              />
              <datalist id="protagonist-presets">
                {protagonistPresets.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field label="关系/冲突">
              <Input
                name="relationshipCore"
                list="relationship-presets"
                value={values.relationshipCore}
                onChange={(event) => updateField("relationshipCore", event.target.value)}
              />
              <datalist id="relationship-presets">
                {relationshipPresets.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field label="读者承诺">
              <Input
                name="plotPromise"
                list="promise-presets"
                value={values.plotPromise}
                onChange={(event) => updateField("plotPromise", event.target.value)}
              />
              <datalist id="promise-presets">
                {promisePresets.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field label="预置标签">
              <Input
                name="presetTags"
                value={values.presetTags}
                onChange={(event) => updateField("presetTags", event.target.value)}
                placeholder="可加：甜宠、追妻、身份反转、封闭空间、规则升级"
              />
            </Field>
          </div>
          <Field label="原始灵感">
            <Textarea
              name="originalIdea"
              value={values.originalIdea}
              onChange={(event) => updateField("originalIdea", event.target.value)}
              placeholder="一句话也可以，例如：我在婚礼当天发现未婚夫给我的请柬是假的。"
            />
          </Field>
          <Field label="平台补充要求">
            <Textarea
              name="platformRequirementOverride"
              value={values.platformRequirementOverride}
              onChange={(event) => updateField("platformRequirementOverride", event.target.value)}
              placeholder="例如：知乎体必须导语 + 1、2、3、4 分节；分节不要小标题；结尾必须反转清算。"
            />
          </Field>
          <Field label="禁止事项">
            <Textarea
              name="forbiddenItems"
              value={values.forbiddenItems}
              onChange={(event) => updateField("forbiddenItems", event.target.value)}
              placeholder="不写血腥细节；不写未成年人伤害；不写过度狗血等。"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="创建中">创建项目</SubmitButton>
            <span className="text-sm text-zinc-500">创建后会进入项目工作台，先生成故事方向。</span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function readDraft(): { savedAt?: string; values?: Partial<FormValues> } | null {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as { savedAt?: string; values?: Partial<FormValues> };
  } catch {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    return null;
  }
}

function saveDraft(values: FormValues) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      values,
    }),
  );
}

function getInitialDraft() {
  if (typeof window === "undefined") return null;
  return readDraft();
}

function formatSavedAt(savedAt: string) {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function createDefaultFormValues(defaultLlmSettingsId: string): FormValues {
  return {
    title: "",
    genre: genreOptions[0] ?? "",
    storyDirectionCount: "3",
    keywords: "",
    targetWordCount: "8000",
    targetPlatform: DEFAULT_PLATFORM_KEY,
    pov: "第一人称",
    endingPreference: "反转后清算",
    emotionalTone: "压迫、反击、情绪释放",
    genreStyleReference:
      "强钩子短篇：前三段就给出异常、误会或危险，后续持续抬高代价，结尾完成清算或反转。",
    languageStyleReference:
      "口语化、带火气、少总结。句子允许长短不齐，优先动作、对白、停顿，不写漂亮空话。",
    llmSettingsId: defaultLlmSettingsId,
    timeSpace: "现代都市，婚礼/家庭/职场交错",
    protagonistProfile: "主角表面被动，实际有观察力和反击底牌",
    relationshipCore: "亲密关系里有人隐瞒关键事实，主角被迫做选择",
    plotPromise: "开局有压迫感，中段持续误导，结尾反转清算",
    presetTags: "强钩子、快节奏、伏笔回收、情绪释放",
    originalIdea: "",
    platformRequirementOverride: "",
    forbiddenItems: "",
  };
}

function createInitialFormValues(
  defaultLlmSettingsId: string,
  draftValues?: Partial<FormValues>,
): FormValues {
  return {
    ...createDefaultFormValues(defaultLlmSettingsId),
    ...draftValues,
    llmSettingsId: draftValues?.llmSettingsId ?? defaultLlmSettingsId,
  };
}
