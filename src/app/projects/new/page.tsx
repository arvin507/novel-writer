import { createProjectAction } from "@/app/actions/projects";
import { SubmitButton } from "@/components/form/SubmitButton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/db/prisma";

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

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const settings = await prisma.lLMSettings.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white/90 px-5 py-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-950">新建故事项目</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          先给 Agent 一个完整的创作简报：题材、时空、人物、关系冲突和读者承诺越清楚，后面的方向、大纲和正文越不容易散。
        </p>
      </div>

      {params.error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {params.error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">创作简报</h2>
        </CardHeader>
        <CardContent>
          <form action={createProjectAction} className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="项目标题">
                <Input name="title" placeholder="留空则自动取灵感前几个字" />
              </Field>
              <Field label="故事类型">
                <select name="genre" className={selectClassName}>
                  {genreOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="关键词">
                <Input name="keywords" placeholder="复仇、婚姻、秘密、身份反转" />
              </Field>
              <Field label="目标字数">
                <Input name="targetWordCount" type="number" list="target-word-count-presets" defaultValue={8000} />
                <datalist id="target-word-count-presets">
                  {[3000, 5000, 8000, 12000, 15000, 20000, 30000].map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </Field>
              <Field label="叙事视角">
                <select name="pov" className={selectClassName} defaultValue="第一人称">
                  {povOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="结局倾向">
                <select name="endingPreference" className={selectClassName} defaultValue="反转后清算">
                  {endingOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="情绪基调">
                <select name="emotionalTone" className={selectClassName} defaultValue="压迫、反击、情绪释放">
                  {toneOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="AI 模型配置">
                <select
                  name="llmSettingsId"
                  className={selectClassName}
                  defaultValue={settings[0]?.id ?? ""}
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
                <select name="timeSpace" className={selectClassName} defaultValue="现代都市，婚礼/家庭/职场交错">
                  {timeSpaceOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="人物预设">
                <Input
                  name="protagonistProfile"
                  list="protagonist-presets"
                  defaultValue="主角表面被动，实际有观察力和反击底牌"
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
                  defaultValue="亲密关系里有人隐瞒关键事实，主角被迫做选择"
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
                  defaultValue="开局有压迫感，中段持续误导，结尾反转清算"
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
                  defaultValue="强钩子、快节奏、伏笔回收、情绪释放"
                  placeholder="可加：甜宠、追妻、身份反转、封闭空间、规则升级"
                />
              </Field>
            </div>
            <Field label="原始灵感">
              <Textarea
                name="originalIdea"
                placeholder="一句话也可以，例如：我在婚礼当天发现未婚夫给我的请柬是假的。"
              />
            </Field>
            <Field label="禁止事项">
              <Textarea name="forbiddenItems" placeholder="不写血腥细节；不写未成年人伤害；不写过度狗血等。" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingText="创建中">创建项目</SubmitButton>
              <span className="text-sm text-zinc-500">创建后会进入项目工作台，先生成故事方向。</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
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
