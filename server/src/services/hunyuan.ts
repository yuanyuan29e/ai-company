import OpenAI from 'openai';
import { buildChatPrompt, personaPrompts } from '../prompts/personas.js';
import { searchFewShot, isDbAvailable } from './reactionDb.js';

/** 获取混元 OpenAI 兼容客户端（单例） */
let _client: OpenAI | null = null;
function getHunyuanClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.HUNYUAN_API_KEY;
    if (!apiKey) {
      throw new Error('HUNYUAN_API_KEY 未配置，请在 .env 中设置');
    }
    _client = new OpenAI({
      apiKey,
      baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
    });
  }
  return _client;
}

/**
 * 流式调用混元大模型（真实API模式）
 * 使用 OpenAI 兼容接口，支持流式输出
 */
async function* callHunyuanStream(
  persona: string,
  plotSummary: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>
): AsyncGenerator<string> {
  const client = getHunyuanClient();
  const systemPrompt = buildChatPrompt(persona, plotSummary);
  const model = process.env.HUNYUAN_CHAT_MODEL || 'hunyuan-lite';

  console.log('[Hunyuan] 调用模型:', model);
  console.log('[Hunyuan] System Prompt length:', systemPrompt.length);
  console.log('[Hunyuan] User message:', userMessage);

  // 构建消息列表
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  // 加入历史对话（最近10轮）
  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // 加入当前用户消息
  messages.push({ role: 'user', content: userMessage });

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 100,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error: any) {
    console.error('[Hunyuan] API 调用失败:', error?.message || error);
    yield `抱歉，AI 回复生成失败：${error?.message || '未知错误'}。请检查 API 配置。`;
  }
}

/**
 * 流式调用混元多模态视觉理解（hunyuan-vision）
 * 借鉴 LiveCC 思路：视频帧 + 上下文 → 多模态 LLM → 实时场景理解
 *
 * @param frames Base64 编码的视频帧数组（最近N帧）
 * @param plotContext 当前剧情上下文
 * @param persona 人格类型
 * @param previousReactions 之前的 Reaction 记录（避免重复）
 */
async function* callHunyuanVisionStream(
  frames: string[],
  plotContext: string,
  persona: string,
  previousReactions: string[] = []
): AsyncGenerator<string> {
  const client = getHunyuanClient();
  const visionModel = process.env.HUNYUAN_VISION_MODEL || 'hunyuan-vision';

  console.log('[HunyuanVision] 调用模型:', visionModel, '帧数:', frames.length);

  // 构建视觉理解的 system prompt
  const visionSystemPrompt = buildVisionReactionPrompt(persona, plotContext, previousReactions);

  // 构建多模态消息：文本 + 图片帧
  const contentParts: OpenAI.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: '你正在追剧，看到了这个画面。作为观众发一条弹幕（必须15字以内，口语化，像"笑死""啊啊啊好甜""完了要虐了"这种风格）：',
    },
  ];

  // 添加视频帧图片（最多4帧，避免 token 过长）
  const framesToUse = frames.slice(-4);
  for (let i = 0; i < framesToUse.length; i++) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: framesToUse[i].startsWith('data:') ? framesToUse[i] : `data:image/jpeg;base64,${framesToUse[i]}`,
      },
    });
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: visionSystemPrompt },
    { role: 'user', content: contentParts },
  ];

  try {
    const stream = await client.chat.completions.create({
      model: visionModel,
      messages,
      stream: true,
      temperature: 0.85,
      max_tokens: 30,  // 弹幕最多15字，30 token 绰绰有余
      top_p: 0.85,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error: any) {
    console.error('[HunyuanVision] API 调用失败:', error?.message || error);
    yield `[视觉理解失败] ${error?.message || '未知错误'}`;
  }
}

/**
 * 非流式调用视觉理解（用于快速场景分析）
 */
export async function analyzeFrames(
  frames: string[],
  plotContext: string
): Promise<string> {
  const client = getHunyuanClient();
  const visionModel = process.env.HUNYUAN_VISION_MODEL || 'hunyuan-vision';

  const contentParts: OpenAI.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `你是视频场景标注员。用关键词标注当前画面，不要写完整句子。

剧情上下文：${plotContext}

输出格式（严格遵守）：
人物：xxx | 动作：xxx | 场景：xxx | 情绪：xxx

示例输出：
人物：男女主 | 动作：对峙 | 场景：悬崖边 | 情绪：紧张

不超过30字，禁止写段落。`,
    },
  ];

  const framesToUse = frames.slice(-3);
  for (const frame of framesToUse) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: frame.startsWith('data:') ? frame : `data:image/jpeg;base64,${frame}`,
      },
    });
  }

  try {
    const response = await client.chat.completions.create({
      model: visionModel,
      messages: [{ role: 'user', content: contentParts }],
      temperature: 0.3,
      max_tokens: 80,
    });

    return response.choices?.[0]?.message?.content || '无法识别当前画面。';
  } catch (error: any) {
    console.error('[analyzeFrames] 失败:', error?.message);
    return '画面分析暂时不可用。';
  }
}

/**
 * 画面人物鉴别函数
 * 判断当前帧画面中是否有人物角色存在
 * 
 * @param frames Base64 编码的视频帧
 * @returns { hasCharacter: boolean, description: string }
 */
export async function detectCharacterInFrame(
  frames: string[]
): Promise<{ hasCharacter: boolean; description: string }> {
  const client = getHunyuanClient();
  const visionModel = process.env.HUNYUAN_VISION_MODEL || 'hunyuan-vision';

  const contentParts: OpenAI.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `你是画面人物检测器。只需判断当前画面中是否有人物/角色出现。

规则：
- 人物包括：真人、动漫角色、CG角色、任何类人形象
- 不包括：纯风景、纯特效、文字画面、空镜头、建筑、动物（无人出现时）

只输出一个JSON，不要多余文字：
{"hasCharacter": true/false, "brief": "简要说明(10字内)"}

示例输出：
{"hasCharacter": true, "brief": "男女主对话"}
{"hasCharacter": false, "brief": "山川风景空镜"}`,
    },
  ];

  const framesToUse = frames.slice(-2); // 只用最近2帧即可判断
  for (const frame of framesToUse) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: frame.startsWith('data:') ? frame : `data:image/jpeg;base64,${frame}`,
      },
    });
  }

  try {
    const response = await client.chat.completions.create({
      model: visionModel,
      messages: [{ role: 'user', content: contentParts }],
      temperature: 0.1, // 低温度，确保判断稳定
      max_tokens: 50,
    });

    const result = response.choices?.[0]?.message?.content || '';
    console.log('[CharacterDetect] 原始返回:', result);

    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(result.trim());
      return {
        hasCharacter: !!parsed.hasCharacter,
        description: parsed.brief || '',
      };
    } catch {
      // JSON 解析失败，通过关键词判断
      const hasChar = !/(无人|空镜|风景|建筑|纯景|没有人|无角色)/.test(result);
      return { hasCharacter: hasChar, description: result.slice(0, 20) };
    }
  } catch (error: any) {
    console.error('[CharacterDetect] 检测失败:', error?.message);
    // 检测失败时默认放行（不阻断）
    return { hasCharacter: true, description: '检测异常，默认放行' };
  }
}

/**
 * 人设到 text_category 的映射
 * 数据库中 text_category: reaction/analysis/emotion/humor
 */
const personaToCategoryMap: Record<string, string> = {
  explorer: 'analysis',   // 阿探 → 分析类
  analyst: 'analysis',
  empath: 'emotion',      // 糖糖 → 情感类
  gentle: 'emotion',
  comfort: 'emotion',
  director: 'reaction',   // 戏骨哥 → 反应类
  critic: 'reaction',
  roaster: 'humor',       // 乐子人 → 搞笑类
  roast: 'humor',
  creative: 'humor',
  timekeeper: 'reaction', // 小理 → 反应类
};

/**
 * 从 Reaction 数据库检索 few-shot 示例
 * 如果数据库不可用或无数据则返回空数组（降级为默认示例）
 * 
 * 修复：正确映射 persona → text_category，并排除 subtitle 类型
 */
function getFewShotExamples(persona: string, sceneType?: string, emotion?: string): string[] {
  try {
    if (!isDbAvailable()) return [];
    
    // 将人设映射为数据库中的 text_category
    const textCategory = personaToCategoryMap[persona] || 'reaction';
    
    const results = searchFewShot({
      text_category: textCategory,
      source_type: 'danmaku',  // 只用弹幕，排除字幕和评论
      limit: 8,
    });
    
    if (results.length > 0) {
      console.log(`[FewShot] ✅ 检索到 ${results.length} 条示例 (persona=${persona} → category=${textCategory})`);
      return results.map(r => `- "${r.text}"`);
    } else {
      console.log(`[FewShot] ⚠️ 未检索到匹配示例 (persona=${persona}, category=${textCategory})`);
    }
  } catch (error) {
    console.error('[FewShot] 检索失败，使用默认示例:', error);
  }
  
  return [];
}

/**
 * 构建视觉 Reaction 的 prompt
 * 核心原则：输出必须像弹幕/短评，绝对不能像"图片描述"
 * 
 * 增强：从 Reaction 数据库检索 few-shot 示例注入 prompt，
 * 使 AI 输出更贴近真实观众的弹幕风格
 */
function buildVisionReactionPrompt(
  persona: string,
  plotContext: string,
  previousReactions: string[],
  sceneType?: string,
  emotion?: string
): string {
  const personaConfig = personaPrompts[persona] || personaPrompts.gentle;

  const recentReactionsText = previousReactions.length > 0
    ? `\n【你最近说过的话（请避免重复类似内容）】\n${previousReactions.slice(-5).join('\n')}`
    : '';

  // 从数据库获取 few-shot 示例
  const fewShotExamples = getFewShotExamples(persona, sceneType, emotion);
  
  // 构建正确示范部分：优先使用数据库示例，否则用默认示例
  const defaultExamples = [
    '- "卧槽这也太帅了吧！"',
    '- "完蛋，要BE了..."',
    '- "笑死 这表情绝了"',
    '- "好甜啊啊啊啊！"',
    '- "注意这个眼神，有伏笔"',
    '- "我直接哭了"',
  ];
  
  const examplesSection = fewShotExamples.length > 0
    ? `【正确示范（真实观众弹幕，你必须模仿这种说话方式！）】\n${fewShotExamples.join('\n')}\n\n以上是真实弹幕，你的输出必须和它们一样短、一样口语化、一样有情绪！`
    : `【正确示范】\n${defaultExamples.join('\n')}`;

  return `你是一个正在追剧的真人观众，不是图片描述AI。你的身份是：${personaConfig.name}。

${personaConfig.systemPrompt}

【当前剧情上下文】
${plotContext}
${recentReactionsText}

【核心任务】
你正在看这部剧，结合你对剧情的了解和当前画面，像真人看剧一样判断：这个画面值不值得反应？

【重要规则 - 不是每次都必须反应】
你是一个真人观众。真人看剧不是每秒都在说话的。
- 如果当前画面平平无奇（普通对话过渡、走路、无情绪变化的镜头），直接输出 [SKIP]
- 只有在以下情况才发出反应：
  · 情绪冲击（甜蜜、心疼、搞笑、震撼、尴尬）
  · 剧情转折（反转、伏笔揭示、角色登场、冲突爆发）
  · 视觉亮点（打戏、特效、高颜值镜头、名场面）
  · 台词金句（有梗、有深意、有冲突的对白）
  · 角色细节（微表情、小动作、暗藏深意的举动）
- 你了解剧情背景，可以基于角色关系、伏笔线索给出更深入的反应
- 如果不确定要不要说，就不说。宁可沉默也不要输出无意义的话。
- 输出 [SKIP] 时不要加任何其他内容，只输出这5个字符。

【铁律（违反任何一条都是失败）】
1. 字数限制：最多15个字！！！超过15个字就是失败！！！
2. 禁止描述画面：不准说"画面中""图片展示""场景是""梦幻""仙境""神秘"这类描述词！你是观众不是解说员！
3. 禁止分析性长文：不准写段落、不准用逗号连接多个句子
4. 必须口语化：要像真人打字发弹幕，用网络用语、语气词、感叹句
5. 只输出1句话：不要换行、不要编号、不要加标点后继续写
6. 禁止形容词堆砌：不准输出"梦幻仙境，神秘莫测"这种文艺描述！

${examplesSection}

【错误示范（绝对不能这样）】
- "这组图片展示了一个充满仙气的场景..." ← 禁止！你不是在描述图片！
- "梦幻仙境，神秘莫测" ← 禁止！这是形容词堆砌，不是弹幕！
- "画面中两人正在对话，气氛紧张，光线从窗户..." ← 禁止！太长且是描述！
- "许可证已成功" ← 禁止！这不是弹幕反应！
- "从镜头语言来看，导演通过俯拍..." ← 禁止！太学术！

现在，看这个画面。如果没什么值得反应的，直接输出 [SKIP]。如果有感触，输出你的弹幕反应（15字以内、口语化、有情绪）：`;
}

// ==================== 多Agent协作架构（双链路并行版） ====================
//
// 架构：Agent1 和 Agent2 并行判断，结果合并后交给 Agent3 生成弹幕
//
//         ┌→ Agent1(视觉动作, hunyuan-vision) → 有冲击力动作? ─┐
// 视频帧 ─┤                                                     ├→ 合并决策 → Agent3(弹幕生成)
//         └→ Agent2(台词/剧本, 规则+lite)     → 有台词触动?  ─┘
//
// 合并规则：
// - 都触发 → 仅保留 Agent2 的输出方向（台词触动更有深度）
// - 只有 Agent1 触发 → 用 Agent1 的动作方向
// - 只有 Agent2 触发 → 用 Agent2 的台词方向
// - 都不触发 → [SKIP]

/**
 * 🤖 Agent 1: 视觉动作判断（Action Detector）
 * 模型：hunyuan-vision
 * 触发条件：画面中人物有值得反应的动作或互动
 */
async function agentActionDetector(frames: string[]): Promise<{
  triggered: boolean;
  action: string;
  direction: string;
  characters: string;
  emotion: string;
}> {
  const client = getHunyuanClient();
  const visionModel = process.env.HUNYUAN_VISION_MODEL || 'hunyuan-vision';

  const contentParts: OpenAI.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `你是动作识别器。判断画面中人物是否有"值得观众反应的动作或互动"。

触发（输出YES）：
亲吻、拥抱、打架、推搡、甩巴掌、下跪、表白、哭泣、摔东西、倒地、奔跑追逐、举杯庆祝、握手言和、撕扯、
对视、凝望、微笑、皱眉、争吵、递东西、牵手、鞠躬、转身离开、惊讶、叹气、
面对面说话（有情绪）、相遇、重逢、告别、眼含泪光

不触发（输出NO）：
独自走路（无互动）、纯风景空镜、站着发呆无表情、背影远去（无情绪）、纯文字画面

注意：只要画面中有两个人在互动（哪怕只是对话），大概率应该输出YES。

只输出一行JSON：
{"triggered":true/false,"action":"具体动作","characters":"谁","emotion":"氛围"}`,
    },
  ];

  const framesToUse = frames.slice(-2);
  for (const frame of framesToUse) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: frame.startsWith('data:') ? frame : `data:image/jpeg;base64,${frame}`,
      },
    });
  }

  try {
    const response = await client.chat.completions.create({
      model: visionModel,
      messages: [{ role: 'user', content: contentParts }],
      temperature: 0.2,
      max_tokens: 100,
    });

    const result = response.choices?.[0]?.message?.content || '';
    console.log('[Agent1-动作判断] 原始输出:', result);

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const triggered = !!parsed.triggered;
        const action = parsed.action || '未知';
        let direction = '即时反应';
        if (/(亲吻|拥抱|表白|牵手|凝望|微笑|暧昧)/.test(action)) direction = '嗑糖尖叫';
        else if (/(打架|推搡|甩巴掌|撕扯|争吵)/.test(action)) direction = '紧张震撼';
        else if (/(哭泣|下跪|倒地|泪|告别|离开)/.test(action)) direction = '心疼共情';
        else if (/(举杯|庆祝|握手|重逢|相遇)/.test(action)) direction = '开心感慨';

        return { triggered, action, direction, characters: parsed.characters || '未知', emotion: parsed.emotion || '未知' };
      }
    } catch (e) {
      console.warn('[Agent1] JSON解析失败');
    }

    const hasAction = /(亲|吻|抱|打|哭|跪|推|甩|撕|追|摔|对视|面对面)/.test(result);
    return { triggered: hasAction, action: '未知', direction: '即时反应', characters: '未知', emotion: '未知' };
  } catch (error: any) {
    console.error('[Agent1-动作判断] 调用失败:', error?.message);
    return { triggered: false, action: '未知', direction: '', characters: '未知', emotion: '未知' };
  }
}

/**
 * 🤖 Agent 2: 台词/剧本判断（Dialogue Detector）
 * 策略：规则前置触发 + 模型生成弹幕方向
 * 
 * 核心改进：不再让 hunyuan-lite 做 YES/NO 判断（不可靠），
 * 而是通过检测 plotContext 结构化字段直接触发，模型只负责选方向。
 */
async function agentDialogueDetector(
  plotContext: string,
  _persona: string,
  previousReactions: string[]
): Promise<{
  triggered: boolean;
  direction: string;
  keyLine: string;
}> {
  const client = getHunyuanClient();
  const chatModel = process.env.HUNYUAN_CHAT_MODEL || 'hunyuan-lite';

  // ===== 前置规则判断 =====
  const hasKeyDialogues = plotContext.includes('【本场景关键台词】');
  const hasSceneHint = plotContext.includes('【当前场景提示】');

  // 提取关键台词
  let extractedKeyLine = '';
  if (hasKeyDialogues) {
    const dialogueMatch = plotContext.match(/【本场景关键台词】\n([\s\S]*?)(?:\n\n|$)/);
    if (dialogueMatch) {
      const firstLine = dialogueMatch[1].split('\n')[0];
      extractedKeyLine = firstLine.replace(/^-\s*"?|"?\s*$/g, '');
    }
  }

  // 触发规则
  const hasMultiCharInteraction = hasSceneHint &&
    /(迎接|见面|对话|争吵|拥抱|握手|对峙|相遇|重逢|告别|恭维|殷勤|热情|冲突|拉扯|打闹)/.test(plotContext);
  const shouldTriggerByRule = hasKeyDialogues || hasMultiCharInteraction;

  if (!shouldTriggerByRule) {
    console.log('[Agent2-台词判断] 规则判定: 不触发');
    return { triggered: false, direction: '', keyLine: '' };
  }

  console.log('[Agent2-台词判断] 规则触发! hasDialogues=', hasKeyDialogues);

  // ===== 模型只负责选方向 =====
  const recentText = previousReactions.length > 0
    ? `\n禁止和这些重复：${previousReactions.slice(-3).join('、')}`
    : '';

  const prompt = `你是弹幕方向分析器。根据以下剧情/台词，判断观众最可能的情感反应方向。

【剧情上下文】
${plotContext.slice(0, 300)}
${recentText}

从以下方向选一个最合适的，并提取最关键的台词/描述：
- 嗑糖尖叫（甜蜜、暧昧、心动）
- 心疼共情（悲伤、无奈、心酸）
- 吐槽搞笑（幽默、反差、滑稽）
- 紧张震撼（冲突、反转、高能）
- 感慨唏嘘（命运弄人、讽刺）
- 情感共鸣（温暖、感动）

只输出一行：方向|关键台词
示例：感慨唏嘘|"战鬼人都死绝了"
示例：嗑糖尖叫|"合你的心意吗"`;

  try {
    const response = await client.chat.completions.create({
      model: chatModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 60,
    });

    const result = (response.choices?.[0]?.message?.content || '').trim();
    console.log('[Agent2-台词判断] 模型方向:', result);

    const parts = result.split('|');
    const direction = parts[0]?.trim() || '情感共鸣';
    const keyLine = parts[1]?.trim() || extractedKeyLine;
    return { triggered: true, direction, keyLine: keyLine || extractedKeyLine };
  } catch (error: any) {
    console.error('[Agent2] 模型失败，用规则默认:', error?.message);
    let defaultDirection = '情感共鸣';
    if (/(死|绝|灭|亡|杀|恨)/.test(extractedKeyLine)) defaultDirection = '感慨唏嘘';
    else if (/(爱|甜|吻|抱|心动)/.test(extractedKeyLine)) defaultDirection = '嗑糖尖叫';
    else if (/(哭|泪|痛|苦|命)/.test(extractedKeyLine)) defaultDirection = '心疼共情';
    return { triggered: true, direction: defaultDirection, keyLine: extractedKeyLine };
  }
}

/**
 * 🤖 Agent 3: 弹幕生成Agent（Reaction Creator）
 * 职责：根据触发来源+方向+人格，生成高质量弹幕
 * 
 * 核心要求：
 * - 像真人观众的即时反应，不是画面描述
 * - 口语化、有情绪、可以带梗
 * - 字数自然即可（一般5-20字），不死板限制
 * - 参考数据库中真实弹幕风格
 */
async function* agentReactionCreator(
  source: 'action' | 'dialogue',
  context: { characters: string; action: string; emotion: string; keyLine?: string },
  direction: string,
  plotContext: string,
  persona: string,
  previousReactions: string[]
): AsyncGenerator<string> {
  const client = getHunyuanClient();
  // Agent3 弹幕生成可单独配置更强模型（HUNYUAN_REACTION_MODEL），默认跟随 CHAT_MODEL
  const chatModel = process.env.HUNYUAN_REACTION_MODEL || process.env.HUNYUAN_CHAT_MODEL || 'hunyuan-lite';
  const personaConfig = personaPrompts[persona] || personaPrompts.gentle;

  // 获取数据库中真实弹幕作为 few-shot
  const fewShotExamples = getFewShotExamples(persona);

  const examplesText = fewShotExamples.length > 0
    ? `【真实弹幕参考（模仿这种风格！）】\n${fewShotExamples.slice(0, 8).join('\n')}`
    : `【弹幕风格参考】
- "笑死 当面说死绝了"
- "姐你面前就是战鬼人啊"
- "这编剧懂讽刺"
- "卧槽好帅"
- "啊啊啊好甜我死了"
- "完了要虐了吧"
- "注意他的眼神 有伏笔"
- "哈哈哈哈笑不活了"`;

  const recentText = previousReactions.length > 0
    ? `\n【禁止重复】不要和这些类似：${previousReactions.slice(-5).join('、')}`
    : '';

  const systemPrompt = `你只输出一句弹幕，10字左右。像"笑死""好甜啊""完了要虐了"这种。不要写长句。不要加标点连接多句话。`;

  // 根据来源构建 user prompt
  let userPrompt: string;
  if (source === 'dialogue') {
    const triggerLine = context.keyLine || '';
    // 从plotContext中提取伏笔信息
    const foreshadowMatch = plotContext.match(/【本场景伏笔\/讽刺】\n([\s\S]*?)(?:\n\n|$)/);
    const foreshadow = foreshadowMatch ? foreshadowMatch[1].replace(/^-\s*/gm, '').split('\n')[0] : '';

    // 给模型提供具体弹幕思路让它选一个改写
    let hintLines = '';
    if (foreshadow) {
      hintLines = `
可以参考这些弹幕思路（选一个改写成口语弹幕）：
A. 针对讽刺点吐槽："${foreshadow.slice(0, 30)}"
B. 喊话角色："姐/哥 你不知道旁边就是xxx吗"
C. 感叹台词："这句话绝了"/"笑死 当面说"
D. 情绪反应："啊啊啊""完了""好虐"`;
    } else {
      hintLines = `
可以参考这些弹幕思路：
A. 吐槽台词内容
B. 喊话角色
C. 表达情绪（笑死/好甜/心疼）`;
    }

    userPrompt = `台词："${triggerLine.slice(0, 50)}"
${foreshadow ? `（你知道的秘密：${foreshadow.slice(0, 50)}）` : ''}
${hintLines}

${examplesText}${recentText}

输出一条弹幕（只要一句，10字左右）：`;
  } else {
    userPrompt = `画面：${context.characters}${context.action}
${examplesText}${recentText}

输出一条弹幕（只要一句，10字左右）：`;
  }

  try {
    const stream = await client.chat.completions.create({
      model: chatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      temperature: 0.95,
      max_tokens: 25,
      top_p: 0.92,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error: any) {
    console.error('[Agent3-弹幕生成] 调用失败:', error?.message);
    yield '绝了';
  }
}

// ==================== 导出的统一接口 ====================

/**
 * 统一的流式对话接口
 */
export async function* streamChatResponse(
  persona: string,
  plotSummary: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>
): AsyncGenerator<string> {
  yield* callHunyuanStream(persona, plotSummary, userMessage, history);
}

/**
 * 流式视觉 Reaction 生成接口（双链路并行版）
 *
 *         ┌→ Agent1(视觉动作判断, hunyuan-vision) ─┐
 * 视频帧 ─┤         并行执行 Promise.all            ├→ 合并决策 → Agent3(弹幕生成)
 *         └→ Agent2(台词/剧本判断, 规则+lite)     ─┘
 */
export async function* streamVisionReaction(
  frames: string[],
  plotContext: string,
  persona: string,
  previousReactions: string[] = []
): AsyncGenerator<string> {
  const startTime = Date.now();

  // ===== Agent1 和 Agent2 并行执行 =====
  console.log('[MultiAgent] 🚀 双链路并行: Agent1(动作) + Agent2(台词)');

  const [agent1Result, agent2Result] = await Promise.all([
    agentActionDetector(frames),
    agentDialogueDetector(plotContext, persona, previousReactions),
  ]);

  const parallelTime = Date.now() - startTime;
  console.log(`[MultiAgent] 并行完成 (${parallelTime}ms) | Agent1=${agent1Result.triggered} Agent2=${agent2Result.triggered}`);

  // ===== 合并决策 =====
  let source: 'action' | 'dialogue';
  let direction: string;
  let context: { characters: string; action: string; emotion: string; keyLine?: string };

  if (agent1Result.triggered && agent2Result.triggered) {
    console.log('[MultiAgent] 🎯 双触发 → 优先Agent2(台词)');
    source = 'dialogue';
    direction = agent2Result.direction;
    context = { characters: agent1Result.characters, action: agent1Result.action, emotion: agent1Result.emotion, keyLine: agent2Result.keyLine };
  } else if (agent1Result.triggered) {
    console.log('[MultiAgent] 💥 Agent1触发(动作)');
    source = 'action';
    direction = agent1Result.direction;
    context = { characters: agent1Result.characters, action: agent1Result.action, emotion: agent1Result.emotion };
  } else if (agent2Result.triggered) {
    console.log('[MultiAgent] 💬 Agent2触发(台词)');
    source = 'dialogue';
    direction = agent2Result.direction;
    context = { characters: '角色', action: '对话', emotion: '有触动', keyLine: agent2Result.keyLine };
  } else {
    // 🔧 修复：双链路未触发时，不再直接SKIP，而是强制生成一个通用Reaction
    console.log('[MultiAgent] ⚠️ 双链路均未触发，启用Fallback模式');
    source = 'dialogue';
    direction = '情感共鸣';
    context = { characters: '角色', action: '场景', emotion: '观看中', keyLine: '继续观看' };
  }

  // ===== Agent 3: 弹幕生成 =====
  console.log(`[MultiAgent] ✍️ Agent3 | 来源:${source} 方向:"${direction}"`);
  yield* agentReactionCreator(source, context, direction, plotContext, persona, previousReactions);

  console.log(`[MultiAgent] ✅ 完成 (${Date.now() - startTime}ms)`);
}

/**
 * 带视觉上下文的增强对话接口
 */
export async function* streamChatWithVision(
  persona: string,
  plotSummary: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  currentFrame?: string
): AsyncGenerator<string> {
  const client = getHunyuanClient();
  const systemPrompt = buildChatPrompt(persona, plotSummary);

  const hasFrame = currentFrame && currentFrame.length > 0;
  const model = hasFrame
    ? (process.env.HUNYUAN_VISION_MODEL || 'hunyuan-vision')
    : (process.env.HUNYUAN_CHAT_MODEL || 'hunyuan-lite');

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
  }

  if (hasFrame) {
    const contentParts: OpenAI.ChatCompletionContentPart[] = [
      { type: 'text', text: `[用户正在观看视频，以下是当前画面截图]\n\n用户说：${userMessage}` },
      { type: 'image_url', image_url: { url: currentFrame!.startsWith('data:') ? currentFrame! : `data:image/jpeg;base64,${currentFrame}` } },
    ];
    messages.push({ role: 'user', content: contentParts });
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
      temperature: 0.8,
      max_tokens: 100,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error: any) {
    console.error('[HunyuanChat+Vision] 失败:', error?.message);
    yield* callHunyuanStream(persona, plotSummary, userMessage, history);
  }
}
