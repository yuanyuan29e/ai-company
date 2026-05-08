import { Router, Request, Response } from 'express';
import { synthesizeSpeech } from '../services/tts.js';

export const ttsRouter = Router();

/**
 * POST /api/tts
 * 文本转语音接口（支持语速自适应 + 情感参数预留）
 *
 * Body:
 * - text: string              要合成的文本
 * - voiceType: number         声线类型 (可选, 默认602003-爱小悠)
 * - emotionCategory: string   情感类型 (可选, 仅601008/601009/601010支持，预留扩展)
 *                             可选值: neutral/sad/happy/angry/fear/sajiao/surprise/hate/calm
 * - speed: number             语速 (可选, -2到6, 默认0)
 */
ttsRouter.post('/', async (req: Request, res: Response) => {
  const { text, voiceType = 602003, emotionCategory, speed } = req.body;

  if (!text) {
    res.status(400).json({ error: '文本不能为空' });
    return;
  }

  try {
    const result = await synthesizeSpeech(text, voiceType, emotionCategory, speed);

    if (result.audioData) {
      res.setHeader('Content-Type', 'audio/mp3');
      res.send(result.audioData);
    } else {
      res.status(200).json({
        message: result.error || 'TTS服务暂不可用',
        fallback: 'danmaku',
      });
    }
  } catch (error) {
    console.error('[TTS] Error:', error);
    res.status(500).json({ error: '语音合成失败' });
  }
});
