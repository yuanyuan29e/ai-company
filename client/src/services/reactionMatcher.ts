import { SceneNode, ReactionFrequency } from '@/types';

/**
 * 频率过滤：根据用户设置跳过部分节点
 * high: 全部触发
 * medium: 跳过约1/3
 * low: 跳过约1/2
 */
const FREQUENCY_SKIP_RATE: Record<ReactionFrequency, number> = {
  high: 0,
  medium: 0.33,
  low: 0.5,
};

/**
 * 根据当前播放时间匹配应该触发的节点
 * @param nodes 全部节点列表（按时间戳排序）
 * @param currentTime 当前播放时间（秒）
 * @param triggeredIds 已触发过的节点ID集合
 * @param frequency 触发频率设置
 * @param tolerance 时间容差（秒），默认0.8
 * @returns 新触发的节点（可能为空数组）
 */
export function matchReactionNodes(
  nodes: SceneNode[],
  currentTime: number,
  triggeredIds: Set<string>,
  frequency: ReactionFrequency,
  tolerance: number = 2.0
): SceneNode[] {
  const matched: SceneNode[] = [];

  for (const node of nodes) {
    // 已触发过则跳过
    if (triggeredIds.has(node.id)) continue;

    // 时间范围判断（放宽容差，避免因帧率/缓冲跳过节点）
    if (currentTime >= node.timestamp && currentTime <= node.timestamp + tolerance) {
      // 频率过滤
      const skipRate = FREQUENCY_SKIP_RATE[frequency];
      if (skipRate > 0 && Math.random() < skipRate) {
        // 标记为已处理但不触发
        triggeredIds.add(node.id);
        continue;
      }

      matched.push(node);
      triggeredIds.add(node.id);
    }
  }

  return matched;
}

/**
 * 获取截至当前时间的最近剧情摘要
 * @param nodes 全部节点列表
 * @param currentTime 当前播放时间
 */
export function getPlotSummaryAt(nodes: SceneNode[], currentTime: number): string {
  let summary = '剧集刚刚开始。';
  for (const node of nodes) {
    if (node.timestamp <= currentTime) {
      summary = node.plotSummaryUntilNow;
    } else {
      break;
    }
  }
  return summary;
}

/**
 * 快进/后退时重置触发状态
 * 清除所有时间大于新播放位置的节点的触发记录
 */
export function resetTriggeredAfter(
  triggeredIds: Set<string>,
  nodes: SceneNode[],
  newTime: number
): Set<string> {
  const newSet = new Set<string>();
  for (const id of triggeredIds) {
    const node = nodes.find(n => n.id === id);
    if (node && node.timestamp <= newTime) {
      newSet.add(id);
    }
  }
  return newSet;
}
