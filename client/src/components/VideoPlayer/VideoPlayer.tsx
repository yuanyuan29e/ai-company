import React, { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useCompanion } from '@/contexts/CompanionContext';
import { useVideoSync } from '@/hooks/useVideoSync';
import { fetchIntroEndTime } from '@/services/api';
import { motion } from 'framer-motion';

// 视频源：生产用 VITE_VIDEO_URL（外部 CDN），本地默认走 public/01-4K.mp4
const DEMO_VIDEO_URL = import.meta.env.VITE_VIDEO_URL || '/01-4K.mp4';
const EPISODE_ID = 'jiaoou-ep-01';

/** 暴露给父组件的接口 */
export interface VideoPlayerHandle {
  /** 获取 video DOM 元素 */
  getVideoElement: () => HTMLVideoElement | null;
}

/** 真实弹幕数据 - 来源：腾讯视频《佳偶天成》第1集 (vid: v4102yte9jg) */
const DANMAKU_POOL = [
  '看过《暮白首》的，快来报到！', '还以为腾讯不播呢，我只剩腾讯会员了',
  '陆千乔我又从头来了', '冲着这名字，坐等一个大团圆结局！',
  '空镜把我看哭了', '让我看看怎么个事！~', '这个转场封神了',
  '终于等到陆千乔了', '每一帧都能当壁纸', '感觉挺好看的',
  '狱花，这个扮相真好看', '嘉人们，你们来晚了', '又是陆大人',
  '好豪华的牢房', '开局就在牢狱相亲？', '好冷静的说出好残忍的话啊',
  '这俩人还都挺迷信的哈哈', '我可以 我可以', '雨帘如珠太会拍',
  '任嘉伦演技炸裂', '枫叶转场封神了', '确实 这部剧是先婚后爱',
  '任嘉伦帅', '故意的吧', '豪华版牢房 哈哈哈',
  '这是李莲花出场的那个集市啊', '闹鬼，闹的是战鬼',
  '陆大人宠妻狂魔啊啊啊', '放开他，让我来，我愿意',
  '陆大人新婚快乐🎉', '新郎好美', '先婚后爱 好的',
  '最豪华版的监狱', '啊啊啊啊好喜欢！新婚快乐啊二位！',
  '新娘子好美🥰', '任嘉伦咋保养的', '不亲一下',
  '这盆兰花一定不简单啊', '第一集就大婚？编剧是懂我们爱看什么的',
  '下集见陆大人', '《周生如故》粉丝继续集合！',
];

/** 热评弹幕池 - 来源：腾讯视频真实高赞弹幕 */
const HOT_DANMAKU_POOL = [
  { text: '不容易啊，任嘉伦终于有个戏完完整整成亲的了', hot: 1483, color: '#CD87FF' },
  { text: '我不吃亏，我嫁给你', hot: 1148, color: '#44EB1F' },
  { text: '陆大人和贺思慕是亲戚吧', hot: 1090, color: '#FF1964' },
  { text: '这么直白呢哈哈合心意合心意', hot: 1073, color: '#FFFFFF' },
  { text: '扎心了小胖', hot: 1041, color: '#FFFFFF' },
  { text: '现在入狱了', hot: 1018, color: '#FF53FD' },
  { text: '源仲？还联动了', hot: 931, color: '#FF1964' },
  { text: '监狱相亲', hot: 911, color: '#FF53FD' },
  { text: '合嘉人们的心意', hot: 890, color: '#15DE8F' },
  { text: '大婚啦，我随1000记任嘉伦账上', hot: 885, color: '#CD87FF' },
  { text: '"慢慢走 跟着我吧"', hot: 885, color: '#FFFFFF' },
  { text: '点题了，佳偶天成', hot: 861, color: '#FF1964' },
];

interface DanmakuItem {
  id: number;
  text: string;
  top: number;
  speed: number;
  color: string;
  isHot?: boolean;
  hotValue?: number;
  createdAt: number;
}

interface VideoPlayerProps {
  onAiCompanionClick: () => void;
  /** 外部全屏切换回调（由 PlayerPage 管理整体全屏） */
  onFullscreenToggle?: () => void;
  /** 外部全屏状态 */
  externalFullscreen?: boolean;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ onAiCompanionClick, onFullscreenToggle, externalFullscreen }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { settings, playerState, toggleSettings, setVolume } = useCompanion();
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [danmakuInput, setDanmakuInput] = useState('');
  const [danmakuList, setDanmakuList] = useState<DanmakuItem[]>([]);
  const [showDanmaku, setShowDanmaku] = useState(true);
  const controlsTimerRef = useRef<number | null>(null);
  const danmakuIdRef = useRef(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const volumeTimerRef = useRef<number | null>(null);
  const [introEndTime, setIntroEndTime] = useState(0);
  const autoSkippedRef = useRef(false);

  // 启动时拉取片头结束时间
  useEffect(() => {
    fetchIntroEndTime(EPISODE_ID).then(setIntroEndTime).catch(() => {});
  }, []);

  // 自动跳过片头：视频元数据加载完成 + 片头时间已获取 + 尚未跳过 → seek
  useEffect(() => {
    const video = videoRef.current;
    if (!video || introEndTime <= 0 || autoSkippedRef.current) return;

    const trySkip = () => {
      if (autoSkippedRef.current) return;
      if (video.readyState < 1) return;
      if (video.currentTime >= introEndTime - 0.5) {
        autoSkippedRef.current = true;
        return;
      }
      video.currentTime = introEndTime;
      autoSkippedRef.current = true;
    };

    if (video.readyState >= 1) {
      trySkip();
    } else {
      video.addEventListener('loadedmetadata', trySkip, { once: true });
      return () => video.removeEventListener('loadedmetadata', trySkip);
    }
  }, [introEndTime]);

  // 使用外部全屏状态（如果提供）
  const effectiveFullscreen = externalFullscreen ?? isFullscreen;

  // 暴露 videoRef 给父组件
  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current,
  }), []);

  useVideoSync(videoRef);

  // 音量同步：将 settings.volume 同步到 video 元素
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = isMuted ? 0 : settings.volume / 100;
    video.muted = isMuted;
  }, [settings.volume, isMuted]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value);
    setVolume(vol);
    if (vol > 0 && isMuted) setIsMuted(false);
  }, [setVolume, isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const handleVolumeAreaEnter = useCallback(() => {
    if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    setShowVolumeSlider(true);
  }, []);

  const handleVolumeAreaLeave = useCallback(() => {
    volumeTimerRef.current = window.setTimeout(() => {
      setShowVolumeSlider(false);
    }, 300);
  }, []);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => {
      if (playerState.isPlaying) setShowControls(false);
    }, 3000);
  }, [playerState.isPlaying]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    video.currentTime = ratio * video.duration;
  }, []);

  const rates = [0.5, 1, 1.25, 1.5, 2];
  const toggleRate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const idx = rates.indexOf(playbackRate);
    const nextRate = rates[(idx + 1) % rates.length];
    video.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  }, [playbackRate]);

  const toggleFullscreen = useCallback(() => {
    // 优先使用外部全屏控制（PlayerPage 管理整体全屏，包含 AI 侧边栏）
    if (onFullscreenToggle) {
      onFullscreenToggle();
      return;
    }
    // 降级：VideoPlayer 自身全屏
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, [onFullscreenToggle]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // 模拟弹幕生成（普通弹幕 + 热评弹幕）
  useEffect(() => {
    if (!playerState.isPlaying || !showDanmaku) return;
    // 普通弹幕
    const interval = setInterval(() => {
      const text = DANMAKU_POOL[Math.floor(Math.random() * DANMAKU_POOL.length)];
      const colors = ['#fff', '#fff', '#fff', '#fff', '#FF6A00', '#4CC9F0', '#2ECC71', '#FFD700'];
      setDanmakuList(prev => [...prev.slice(-30), {
        id: ++danmakuIdRef.current,
        text,
        top: 8 + Math.random() * 60,
        speed: 7 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        createdAt: Date.now(),
      }]);
    }, 500 + Math.random() * 800);

    // 热评弹幕（频率较低）
    const hotInterval = setInterval(() => {
      const hotItem = HOT_DANMAKU_POOL[Math.floor(Math.random() * HOT_DANMAKU_POOL.length)];
      setDanmakuList(prev => [...prev.slice(-30), {
        id: ++danmakuIdRef.current,
        text: hotItem.text,
        top: 3 + Math.random() * 12,
        speed: 10 + Math.random() * 4,
        color: hotItem.color,
        isHot: true,
        hotValue: hotItem.hot,
        createdAt: Date.now(),
      }]);
    }, 4000 + Math.random() * 3000);

    return () => {
      clearInterval(interval);
      clearInterval(hotInterval);
    };
  }, [playerState.isPlaying, showDanmaku]);

  // 清理过期弹幕（修复：使用时间戳而非自增id）
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setDanmakuList(prev => prev.filter(d => now - d.createdAt < 15000));
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const progress = playerState.duration > 0
    ? (playerState.currentTime / playerState.duration) * 100
    : 0;

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black select-none overflow-hidden ${effectiveFullscreen ? 'h-full' : ''}`}
      style={effectiveFullscreen ? undefined : { aspectRatio: '16 / 9' }}
      onMouseMove={resetControlsTimer}
      onMouseEnter={() => setShowControls(true)}
    >
      {/* 视频 */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black"
        src={DEMO_VIDEO_URL}
        onClick={togglePlay}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
      />

      {/* 左上角 - 剧名 */}
      <div className={`absolute top-3 left-4 z-20 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <span className="text-white text-sm font-semibold drop-shadow-lg">佳偶天成 第01集</span>
      </div>

      {/* 右上角 - 客户端播放 + 时间 */}
      <div className={`absolute top-3 right-4 z-20 flex items-center gap-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <button className="flex items-center gap-1 text-white/70 text-[11px] bg-white/10 rounded px-2 py-0.5 hover:bg-white/20 transition-colors">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
          </svg>
          客户端播放
        </button>
        <span className="text-white/50 text-[11px] font-mono">16:36</span>
      </div>

      {/* 右上角 - 腾讯视频水印 (带播放三角) */}
      <div className="absolute top-3 right-4 z-10 opacity-40 pointer-events-none flex items-center gap-1" style={{ top: '12px', right: '14px' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <span className="text-white text-[11px] font-medium tracking-wider">腾讯视频</span>
      </div>

      {/* 弹幕层 */}
      {showDanmaku && (
        <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
          {danmakuList.map(d => (
            <div
              key={d.id}
              className={`absolute whitespace-nowrap font-medium ${d.isHot ? 'flex items-center gap-1' : ''}`}
              style={{
                top: `${d.top}%`,
                color: d.color,
                textShadow: d.isHot
                  ? '0 0 8px rgba(255,68,68,0.5), 1px 1px 3px rgba(0,0,0,0.9)'
                  : '1px 1px 2px rgba(0,0,0,0.8)',
                animation: `danmakuScroll ${d.speed}s linear forwards`,
                animationPlayState: playerState.isPlaying ? 'running' : 'paused',
                fontSize: d.isHot ? 'clamp(16px, 1.3vw, 22px)' : 'clamp(14px, 1.1vw, 20px)',
                fontWeight: d.isHot ? 600 : 400,
              }}
            >
              {d.text}
              {d.isHot && d.hotValue && d.hotValue > 0 && (
                <span className="inline-flex items-center gap-0.5 ml-1 text-[12px] opacity-80">
                  <span>🔥</span>
                  <span>{d.hotValue}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 播放大按钮 */}
      {!playerState.isPlaying && playerState.currentTime === 0 && (
        <div className="absolute inset-0 flex items-center justify-center cursor-pointer z-[15]" onClick={togglePlay}>
          <div className="w-16 h-16 bg-gradient-to-br from-txv-orange to-txv-orange-dark rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-2xl shadow-txv-orange/30 animate-breathe-subtle">
            <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      )}

      {/* ========== 控制栏 ========== */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)' }}
      >
        {/* 第一行: 进度条 + 时间 */}
        <div className="px-3 pt-4 pb-1">
          <div className="flex items-center gap-3">
            <span className="text-white text-[12px] font-mono w-10 text-right flex-shrink-0">
              {formatTime(playerState.currentTime)}
            </span>
            <div className="flex-1 h-1 cursor-pointer group relative" onClick={handleProgressClick}>
              <div className="w-full h-full bg-white/15 relative rounded-full overflow-hidden group-hover:h-1.5 transition-all duration-200">
                <div
                  className="h-full rounded-full relative"
                  style={{ 
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #FF6A00, #FF8C33)',
                    boxShadow: '0 0 8px rgba(255, 106, 0, 0.4)',
                  }}
                />
              </div>
              {/* 拖拽圆点 */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 ring-2 ring-txv-orange/60"
                style={{ left: `${progress}%`, marginLeft: '-7px' }}
              />
            </div>
            <span className="text-white/50 text-[12px] font-mono w-10 flex-shrink-0">
              {formatTime(playerState.duration)}
            </span>
          </div>
        </div>

        {/* 第二行: 控制按钮 */}
        <div className="flex items-center justify-between px-3 pb-2 h-[40px]">
          {/* 左侧 */}
          <div className="flex items-center gap-2">
            {/* 暂停/播放 */}
            <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors p-1">
              {playerState.isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            {/* 下一集 */}
            <button className="text-white hover:text-white/80 transition-colors p-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
              </svg>
            </button>
            {/* 画中画小图标 */}
            <button className="text-white/70 hover:text-white transition-colors p-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/>
              </svg>
            </button>
            {/* 截图 */}
            <button className="text-white/70 hover:text-white transition-colors p-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
            </button>
            {/* 弹幕输入框 */}
            <div className="flex items-center gap-1.5 ml-2">
              <button
                onClick={() => setShowDanmaku(!showDanmaku)}
                className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
                  showDanmaku
                    ? 'text-txv-orange'
                    : 'text-[#555]'
                }`}
                title={showDanmaku ? '关闭弹幕' : '开启弹幕'}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                </svg>
              </button>
              <div className="relative">
                <input
                  type="text"
                  value={danmakuInput}
                  onChange={e => setDanmakuInput(e.target.value)}
                  placeholder="发条弹幕，证明你来"
                  className="bg-[#2A2A2E] text-white/80 text-[12px] w-[140px] outline-none placeholder-[#555] px-3 py-1.5 rounded-full border border-[#3A3A3E] focus:border-txv-orange/50 transition-colors"
                />
              </div>
              {/* 弹幕设置 */}
              <button className="text-white/50 hover:text-white/70 transition-colors p-0.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
                </svg>
              </button>
            </div>
            {/* 讨论7万+ */}
            <button className="flex items-center gap-1 text-white/60 text-[12px] hover:text-white/80 transition-colors ml-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"/>
              </svg>
              讨论7万+
            </button>
          </div>

          {/* 右侧 */}
          <div className="flex items-center gap-1">
            {/* AI陪看按钮 ★核心入口★ */}
            <motion.button
              onClick={onAiCompanionClick}
              onContextMenu={(e) => { e.preventDefault(); toggleSettings(); }}
              className={`relative flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-all mr-1 ${
                settings.enabled
                  ? 'bg-gradient-to-r from-txv-orange to-txv-orange-light text-white shadow-glow-orange-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span>✨</span>
              <span>剧搭子</span>
              {settings.enabled && (
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
              )}
              {settings.enabled && (
                <span className="absolute inset-0 rounded-md animate-pulse-glow-orange opacity-50 pointer-events-none" />
              )}
            </motion.button>

            {/* 查看会员 - 金色边框 */}
            <button className="text-[12px] text-[#FFD700] border border-[#FFD700]/50 rounded px-2.5 py-0.5 hover:bg-[#FFD700]/10 transition-colors whitespace-nowrap">
              查看会员
            </button>

            {/* 臻彩1080P */}
            <button className="text-white/60 text-[12px] hover:text-white/80 transition-colors px-1.5 whitespace-nowrap">
              臻彩1080P
            </button>

            {/* 倍速 */}
            <button onClick={toggleRate} className="text-white/60 text-[12px] hover:text-white/80 transition-colors px-1.5 whitespace-nowrap">
              {playbackRate === 1 ? '倍速' : `${playbackRate}x`}
            </button>

            {/* 音量控件 */}
            <div
              className="relative flex items-center"
              onMouseEnter={handleVolumeAreaEnter}
              onMouseLeave={handleVolumeAreaLeave}
            >
              <button
                onClick={toggleMute}
                className="text-white/60 hover:text-white/80 transition-colors p-1"
                title={isMuted ? '取消静音' : '静音'}
              >
                {isMuted || settings.volume === 0 ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  </svg>
                ) : settings.volume < 50 ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                )}
              </button>
              {/* 音量滑块 */}
              {showVolumeSlider && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1a1a2e]/95 backdrop-blur-sm rounded-lg px-2 py-3 shadow-xl border border-white/10">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-white/60 text-[10px] font-mono">
                      {isMuted ? '0' : settings.volume}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={isMuted ? 0 : settings.volume}
                      onChange={handleVolumeChange}
                      className="volume-slider"
                      style={{
                        writingMode: 'vertical-lr',
                        direction: 'rtl',
                        width: '4px',
                        height: '80px',
                        appearance: 'none',
                        background: `linear-gradient(to top, #FF6A00 ${isMuted ? 0 : settings.volume}%, rgba(255,255,255,0.2) ${isMuted ? 0 : settings.volume}%)`,
                        borderRadius: '2px',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 设置 */}
            <button className="text-white/60 hover:text-white/80 transition-colors p-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
              </svg>
            </button>

            {/* 画中画 */}
            <button className="text-white/60 hover:text-white/80 transition-colors p-1">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/>
              </svg>
            </button>

            {/* 全屏 */}
            <button onClick={toggleFullscreen} className="text-white/60 hover:text-white/80 transition-colors p-1">
              {effectiveFullscreen ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default VideoPlayer;
