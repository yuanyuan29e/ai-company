import { useRef, useCallback, useEffect, useState } from 'react';
import { useCompanion } from '@/contexts/CompanionContext';

interface FrameSamplerOptions {
  /** 采样间隔（秒），默认 2 */
  interval?: number;
  /** 缓存帧数（保留最近N帧），默认 4 */
  maxFrames?: number;
  /** 输出图片质量 0-1，默认 0.6 */
  quality?: number;
  /** 输出图片宽度（等比缩放），默认 512 */
  outputWidth?: number;
  /** 是否启用采样 */
  enabled?: boolean;
}

interface FrameSamplerResult {
  /** 最近采样的帧（Base64 JPEG） */
  frames: string[];
  /** 最新一帧 */
  latestFrame: string | null;
  /** 是否正在采样中 */
  isSampling: boolean;
  /** 手动截取当前帧 */
  captureFrame: () => string | null;
  /** 清空帧缓存 */
  clearFrames: () => void;
  /** 采样统计 */
  stats: {
    totalCaptured: number;
    lastCaptureTime: number;
  };
}

/**
 * 视频帧采样 Hook
 * 借鉴 LiveCC 思路：定时从 video 元素截取关键帧，用于多模态 AI 分析
 *
 * 原理：
 * 1. 通过 Canvas 2D 上下文从 <video> 元素绘制当前帧
 * 2. 将 Canvas 内容导出为 Base64 JPEG
 * 3. 维护一个滑动窗口缓存最近 N 帧
 * 4. 自动在播放时定时采样，暂停时停止
 */
export function useFrameSampler(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  options: FrameSamplerOptions = {}
): FrameSamplerResult {
  const {
    interval = 2,
    maxFrames = 4,
    quality = 0.6,
    outputWidth = 512,
    enabled = true,
  } = options;

  const { playerState } = useCompanion();
  const [frames, setFrames] = useState<string[]>([]);
  const [isSampling, setIsSampling] = useState(false);
  const [stats, setStats] = useState({ totalCaptured: 0, lastCaptureTime: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const framesRef = useRef<string[]>([]);

  /**
   * 从 video 元素截取当前帧
   * 返回 Base64 JPEG 字符串
   */
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video) {
      console.warn('[FrameSampler] ❌ videoRef.current 为空，无法截取帧');
      return null;
    }
    if (video.readyState < 2) {
      console.warn(`[FrameSampler] ⏳ video readyState=${video.readyState}，等待视频数据...`);
      return null;
    }

    try {
      // 惰性创建 canvas
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;

      // 计算等比缩放尺寸
      const scale = outputWidth / video.videoWidth;
      canvas.width = outputWidth;
      canvas.height = Math.round(video.videoHeight * scale);

      // 绘制当前帧到 canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 导出为 Base64 JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      console.log(`[FrameSampler] ✅ 帧截取成功: ${dataUrl.slice(0, 50)}... (${framesRef.current.length} 帧已缓存)`);

      // 更新帧缓存（滑动窗口）
      const newFrames = [...framesRef.current, dataUrl].slice(-maxFrames);
      framesRef.current = newFrames;
      setFrames(newFrames);

      // 更新统计
      setStats(prev => ({
        totalCaptured: prev.totalCaptured + 1,
        lastCaptureTime: Date.now(),
      }));

      return dataUrl;
    } catch (error) {
      console.warn('[FrameSampler] 帧截取失败:', error);
      return null;
    }
  }, [videoRef, outputWidth, quality, maxFrames]);

  /** 清空帧缓存 */
  const clearFrames = useCallback(() => {
    framesRef.current = [];
    setFrames([]);
  }, []);

  /**
   * 自动采样引擎
   * 在视频播放时按照设定间隔定时截取帧
   */
  useEffect(() => {
    // 不满足条件时停止采样
    if (!enabled || !playerState.isPlaying || playerState.isSeeking) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setIsSampling(false);
      }
      return;
    }

    // 启动定时采样
    setIsSampling(true);

    // 立即采样一帧
    captureFrame();

    timerRef.current = window.setInterval(() => {
      captureFrame();
    }, interval * 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsSampling(false);
    };
  }, [enabled, playerState.isPlaying, playerState.isSeeking, interval, captureFrame]);

  /**
   * 快进/后退时清空帧缓存
   * （因为帧不再连续）
   */
  useEffect(() => {
    if (playerState.isSeeking) {
      clearFrames();
    }
  }, [playerState.isSeeking, clearFrames]);

  return {
    frames,
    latestFrame: frames.length > 0 ? frames[frames.length - 1] : null,
    isSampling,
    captureFrame,
    clearFrames,
    stats,
  };
}
