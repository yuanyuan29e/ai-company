import { Router, Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { streamChatResponse, streamChatWithVision } from '../services/hunyuan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const chatRouter = Router();

/**
 * 根据时间戳获取剧情摘要
 */
function getPlotSummary(episodeId: string, currentTime: number): string {
  const filePath = join(__dirname, '..', 'data', 'episodes', `${episodeId}.json`);

  if (!existsSync(filePath)) {
    return '剧集刚刚开始。';
  }

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    let summary = '剧集刚刚开始。';
    for (const node of data.nodes) {
      if (node.timestamp <= currentTime) {
        summary = node.plotSummaryUntilNow;
      } else {
        break;
      }
    }
    return summary;
  } catch {
    return '剧集刚刚开始。';
  }
}

/**
 * POST /api/chat
 * 流式对话接口 (SSE)
 *
 * Body:
 * - message: string       用户消息
 * - persona: string       当前人格类型
 * - episodeId: string     当前剧集ID
 * - currentTime: number   当前播放时间（秒）
 * - history: Array        对话历史
 * - currentFrame: string  当前视频帧 Base64（可选，传入后启用视觉增强对话）
 */
chatRouter.post('/', async (req: Request, res: Response) => {
  const {
    message,
    persona = 'gentle',
    episodeId = 'episode-01',
    currentTime = 0,
    history = [],
    currentFrame,
  } = req.body;

  if (!message) {
    res.status(400).json({ error: '消息不能为空' });
    return;
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    // 获取防剧透的剧情摘要
    const plotSummary = getPlotSummary(episodeId, currentTime);

    // 根据是否有视频帧选择不同的生成方式
    const stream = currentFrame
      ? streamChatWithVision(persona, plotSummary, message, history, currentFrame)
      : streamChatResponse(persona, plotSummary, message, history);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    // 发送结束标记
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('[Chat] Error:', error);
    res.write(`data: ${JSON.stringify({ error: '生成回复失败，请稍后重试' })}\n\n`);
    res.end();
  }
});
