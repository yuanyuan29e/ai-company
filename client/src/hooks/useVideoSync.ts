import { useEffect, useRef, useCallback } from 'react';
import { useCompanion } from '@/contexts/CompanionContext';

/**
 * 视频同步 Hook
 * 监听 Video.js 播放器事件，同步播放状态到全局 Context
 */
export function useVideoSync(videoElementRef: React.RefObject<HTMLVideoElement | null>) {
  const { updatePlayerState } = useCompanion();
  const syncIntervalRef = useRef<number | null>(null);

  /** 启动时间同步定时器 */
  const startSync = useCallback(() => {
    if (syncIntervalRef.current) return;

    syncIntervalRef.current = window.setInterval(() => {
      const video = videoElementRef.current;
      if (!video) return;

      updatePlayerState({
        currentTime: video.currentTime,
        duration: video.duration || 0,
        isPlaying: !video.paused && !video.ended,
        playbackRate: video.playbackRate,
      });
    }, 250); // 每250ms同步（优化：从500ms降低，减少时间滞后）
  }, [videoElementRef, updatePlayerState]);

  /** 停止同步 */
  const stopSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  /** 绑定播放器事件 */
  useEffect(() => {
    const video = videoElementRef.current;
    if (!video) return;

    const handlePlay = () => {
      updatePlayerState({ isPlaying: true });
      startSync();
    };

    const handlePause = () => {
      updatePlayerState({ isPlaying: false });
    };

    const handleSeeking = () => {
      updatePlayerState({ isSeeking: true });
    };

    const handleSeeked = () => {
      updatePlayerState({
        isSeeking: false,
        currentTime: video.currentTime,
      });
    };

    const handleRateChange = () => {
      updatePlayerState({ playbackRate: video.playbackRate });
    };

    const handleLoadedMetadata = () => {
      updatePlayerState({ duration: video.duration });
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('ratechange', handleRateChange);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    // 初始化同步
    startSync();

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('ratechange', handleRateChange);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      stopSync();
    };
  }, [videoElementRef, updatePlayerState, startSync, stopSync]);

  return { startSync, stopSync };
}
