import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SubtitleEntry {
  start: number;
  end: number;
  text: string;
}

/** 解析字幕文件
 * 格式：
 *   [2.800s - 6.000s]
 *   字幕文本
 *   (空行)
 */
export function parseSubtitleFile(filePath: string): SubtitleEntry[] {
  const content = readFileSync(filePath, 'utf-8');
  const entries: SubtitleEntry[] = [];
  const re = /\[([\d.]+)s\s*-\s*([\d.]+)s\]\s*\n([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const text = m[3].trim();
    if (!text) continue;
    entries.push({
      start: parseFloat(m[1]),
      end: parseFloat(m[2]),
      text,
    });
  }
  return entries.sort((a, b) => a.start - b.start);
}

/**
 * 检测旁白/剧情起点：
 * 片头特征是前段稀疏（logo、制作信息），之后突然变密集（旁白或对话）。
 * 算法：找到第一条字幕，其前面有 >8s 的间隙，且其后三条字幕都连续紧密（间隔 <8s）。
 */
export function detectIntroEnd(subs: SubtitleEntry[]): number {
  if (subs.length < 4) return 0;
  for (let i = 1; i < subs.length - 3; i++) {
    const gapBefore = subs[i].start - subs[i - 1].end;
    if (gapBefore < 8) continue;

    const window = subs.slice(i, i + 4);
    const dense = window.every((s, k, arr) =>
      k === 0 || s.start - arr[k - 1].end < 8
    );
    if (dense) return subs[i].start;
  }
  return 0;
}

/** 缓存：避免每次请求都重新解析字幕 */
const cache = new Map<string, { introEndTime: number; entries: SubtitleEntry[] }>();

export function getSubtitleData(episodeId: string) {
  if (cache.has(episodeId)) return cache.get(episodeId)!;

  const filePath = join(__dirname, '..', 'data', 'subtitles', `${episodeId}.txt`);
  if (!existsSync(filePath)) {
    return { introEndTime: 0, entries: [] };
  }

  const entries = parseSubtitleFile(filePath);
  const introEndTime = detectIntroEnd(entries);
  const data = { introEndTime, entries };
  cache.set(episodeId, data);
  return data;
}
