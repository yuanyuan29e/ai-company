import { Router, Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { streamVisionReaction, analyzeFrames, streamChatWithVision, detectCharacterInFrame } from '../services/hunyuan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const reactionRouter = Router();

/**
 * 剧情上下文结构（增强版）
 */
interface PlotContextResult {
  plotSummary: string;
  sceneHint: string;
  characterMood: string;
  keyDialogues: string[];
  foreshadows: string[];
  /** 当前场景的 timestamp，用于伏笔延迟判定 */
  currentSceneStart: number;
  /** 当前场景的 endTime，用于伏笔延迟判定 */
  currentSceneEnd: number;
}

/**
 * 提取 worldSetting 中的「公开世界观」部分。
 * 规则：在第一个出现具体主角名（陆千乔/辛湄/楮英 等）的句号之前的内容才是公开背景，
 * 之后属于角色身份剧透，不注入给 AI。
 */
function extractPublicWorldSetting(worldSetting: string, mainCharacterNames: string[]): string {
  if (!worldSetting) return '';
  // 找到首个角色名出现位置
  let firstNameIdx = -1;
  for (const name of mainCharacterNames) {
    const idx = worldSetting.indexOf(name);
    if (idx >= 0 && (firstNameIdx === -1 || idx < firstNameIdx)) {
      firstNameIdx = idx;
    }
  }
  if (firstNameIdx < 0) return worldSetting;
  // 截到角色名出现前最近的句号/换行
  const safeSlice = worldSetting.slice(0, firstNameIdx);
  const lastBreak = Math.max(
    safeSlice.lastIndexOf('。'),
    safeSlice.lastIndexOf('\n'),
    safeSlice.lastIndexOf('！'),
    safeSlice.lastIndexOf('？')
  );
  return lastBreak > 0 ? safeSlice.slice(0, lastBreak + 1) : safeSlice;
}

/**
 * 根据时间戳获取剧情上下文（增强版：包含场景提示、角色情绪、关键台词）
 */
function getPlotContext(episodeId: string, currentTime: number): string {
  const filePath = join(__dirname, '..', 'data', 'episodes', `${episodeId}.json`);
  if (!existsSync(filePath)) return '剧集刚刚开始。';

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    let result: PlotContextResult = {
      plotSummary: '剧集刚刚开始。',
      sceneHint: '',
      characterMood: '',
      keyDialogues: [],
      foreshadows: [],
      currentSceneStart: 0,
      currentSceneEnd: 0,
    };

    for (const node of data.nodes) {
      if (node.timestamp <= currentTime) {
        result.plotSummary = node.plotSummaryUntilNow || result.plotSummary;
        // 当前正在播放的场景：取最后一个 timestamp <= currentTime 的节点
        if (node.endTime && currentTime <= node.endTime) {
          result.sceneHint = node.sceneHint || '';
          result.characterMood = node.characterMood || '';
          result.keyDialogues = node.keyDialogues || [];
          result.foreshadows = node.foreshadows || [];
          result.currentSceneStart = node.timestamp;
          result.currentSceneEnd = node.endTime;
        }
      } else {
        break;
      }
    }

    // 构建富文本上下文
    // 防剧透原则：只注入「公开世界观」+「截至当前已揭示的剧情」+「当前场景的画面提示与已说出的台词」
    // mainCharacters 和 worldSetting 后半段含角色身份剧透，不注入
    let context = '';
    if (data.worldSetting && data.mainCharacters) {
      const publicWS = extractPublicWorldSetting(
        data.worldSetting,
        Object.keys(data.mainCharacters)
      );
      if (publicWS) {
        context += `【公开世界观】${publicWS}\n\n`;
      }
    }

    context += result.plotSummary;

    if (result.sceneHint) {
      context += `\n\n【当前场景提示】\n${result.sceneHint}`;
    }

    if (result.characterMood) {
      context += `\n\n【角色情绪】\n${result.characterMood}`;
    }

    if (result.keyDialogues.length > 0) {
      context += `\n\n【本场景关键台词】\n${result.keyDialogues.map(d => `- "${d}"`).join('\n')}`;
    }

    // 伏笔延迟：仅当播放进度过了当前场景一半之后才注入
    // 防止 AI 在事件还未发生时就提前剧透
    if (result.foreshadows.length > 0 && result.currentSceneEnd > 0) {
      const halfPoint = (result.currentSceneStart + result.currentSceneEnd) / 2;
      if (currentTime >= halfPoint) {
        context += `\n\n【本场景伏笔/讽刺】\n${result.foreshadows.map(f => `- ${f}`).join('\n')}`;
      }
    }

    return context;
  } catch {
    return '剧集刚刚开始。';
  }
}

/**
 * POST /api/reaction/vision
 * AI 视觉 Reaction 流式生成接口（SSE）
 * 借鉴 LiveCC 核心思路：视频帧 → 多模态理解 → 实时评论
 *
 * Body:
 * - frames: string[]         Base64 编码的视频帧数组
 * - persona: string          当前人格类型
 * - episodeId: string        当前剧集ID
 * - currentTime: number      当前播放时间（秒）
 * - previousReactions: string[]  之前的 Reaction（避免重复）
 */
reactionRouter.post('/vision', async (req: Request, res: Response) => {
  const {
    frames = [],
    persona = 'gentle',
    episodeId = 'episode-01',
    currentTime = 0,
    previousReactions = [],
  } = req.body;

  if (!frames || frames.length === 0) {
    res.status(400).json({ error: '视频帧不能为空' });
    return;
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const plotContext = getPlotContext(episodeId, currentTime);

    console.log(`\n========================================`);
    console.log(`[Reaction] 📥 收到请求 | persona=${persona} | time=${currentTime}s | frames=${frames.length} | episodeId=${episodeId}`);
    console.log(`[Reaction] plotContext前50字: ${plotContext.slice(0, 50)}...`);
    console.log(`========================================`);

    const stream = streamVisionReaction(frames, plotContext, persona, previousReactions);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[Reaction] Vision Error:', error);
    res.write(`data: ${JSON.stringify({ error: '视觉 Reaction 生成失败' })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/reaction/analyze
 * 视频帧场景分析接口（非流式，返回场景描述）
 *
 * Body:
 * - frames: string[]        Base64 编码的视频帧数组
 * - episodeId: string       当前剧集ID
 * - currentTime: number     当前播放时间（秒）
 */
reactionRouter.post('/analyze', async (req: Request, res: Response) => {
  const {
    frames = [],
    episodeId = 'episode-01',
    currentTime = 0,
  } = req.body;

  if (!frames || frames.length === 0) {
    res.status(400).json({ error: '视频帧不能为空' });
    return;
  }

  try {
    const plotContext = getPlotContext(episodeId, currentTime);
    const description = await analyzeFrames(frames, plotContext);

    res.json({
      description,
      currentTime,
      frameCount: frames.length,
    });
  } catch (error) {
    console.error('[Reaction] Analyze Error:', error);
    res.status(500).json({ error: '场景分析失败' });
  }
});

/**
 * POST /api/reaction/detect-character
 * 画面人物鉴别接口（独立端点，可用于调试和前端预判）
 *
 * Body:
 * - frames: string[]  Base64 编码的视频帧数组
 *
 * Response:
 * - hasCharacter: boolean  画面中是否有人物
 * - description: string    简要描述
 */
reactionRouter.post('/detect-character', async (req: Request, res: Response) => {
  const { frames = [] } = req.body;

  if (!frames || frames.length === 0) {
    res.status(400).json({ error: '视频帧不能为空' });
    return;
  }

  try {
    const result = await detectCharacterInFrame(frames);
    console.log(`[Reaction] 人物鉴别: hasCharacter=${result.hasCharacter}, desc="${result.description}"`);
    res.json(result);
  } catch (error) {
    console.error('[Reaction] Detect Character Error:', error);
    res.status(500).json({ error: '画面人物鉴别失败' });
  }
});
