import { Router, Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getSubtitleData } from '../services/subtitle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const nodesRouter = Router();

/**
 * GET /api/nodes/:episodeId
 * 获取指定剧集的剧情节点数据
 */
nodesRouter.get('/:episodeId', (req: Request, res: Response) => {
  const { episodeId } = req.params;
  const filePath = join(__dirname, '..', 'data', 'episodes', `${episodeId}.json`);

  if (!existsSync(filePath)) {
    res.status(404).json({ error: `剧集 ${episodeId} 的数据不存在` });
    return;
  }

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: '读取剧集数据失败' });
  }
});

/**
 * GET /api/nodes/:episodeId/summary
 * 根据时间戳获取截至该时间点的剧情摘要（防剧透用）
 */
nodesRouter.get('/:episodeId/summary', (req: Request, res: Response) => {
  const { episodeId } = req.params;
  const currentTime = parseFloat(req.query.time as string) || 0;
  const filePath = join(__dirname, '..', 'data', 'episodes', `${episodeId}.json`);

  if (!existsSync(filePath)) {
    res.status(404).json({ error: `剧集 ${episodeId} 的数据不存在` });
    return;
  }

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    // 找到当前时间之前最近的节点的剧情摘要
    let summary = '剧集刚刚开始。';
    for (const node of data.nodes) {
      if (node.timestamp <= currentTime) {
        summary = node.plotSummaryUntilNow;
      } else {
        break;
      }
    }
    res.json({ summary, currentTime });
  } catch (err) {
    res.status(500).json({ error: '获取剧情摘要失败' });
  }
});

/**
 * GET /api/nodes/:episodeId/intro-end
 * 根据字幕文件检测片头结束位置（旁白/剧情起点）
 * 返回：{ introEndTime: number }（秒，0 表示未检出）
 */
nodesRouter.get('/:episodeId/intro-end', (req: Request, res: Response) => {
  const { episodeId } = req.params;
  const { introEndTime } = getSubtitleData(episodeId);
  res.json({ introEndTime });
});
