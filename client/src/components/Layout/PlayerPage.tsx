import { useState, useCallback, useRef, useEffect } from 'react';
import { useCompanion } from '@/contexts/CompanionContext';
import { useFrameSampler } from '@/hooks/useFrameSampler';
import { useAIReactionEngine } from '@/hooks/useAIReactionEngine';
import { EmotionType, PERSONA_CONFIGS } from '@/types';
import Header from './Header';
import VideoPlayer, { VideoPlayerHandle } from '@/components/VideoPlayer/VideoPlayer';
import CompanionAvatar from '@/components/AiCompanion/CompanionAvatar';
import ReactionOverlay from '@/components/AiCompanion/ReactionOverlay';
import ChatPanel from '@/components/ChatPanel/ChatPanel';
import SettingsPanel from '@/components/SettingsPanel/SettingsPanel';
import OnboardingDialog from './OnboardingDialog';
import EpisodeInfoPanel from '@/components/SidePanel/EpisodeInfoPanel';
import UserReviews from '@/components/Reviews/UserReviews';

export default function PlayerPage() {
  const { settings, hasOnboarded, toggleCompanion, setLatestFrame } = useCompanion();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsSidebarCollapsed, setFsSidebarCollapsed] = useState(false);
  const [nonFsSidebarCollapsed, setNonFsSidebarCollapsed] = useState(false);

  // VideoPlayer ref，用于获取 video DOM 元素
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  // 整个播放器+AI区域的容器 ref（用于全屏）
  const playerAreaRef = useRef<HTMLDivElement>(null);

  // 🔧 修复：使用回调方式同步video元素，并添加日志
  const syncVideoRef = useCallback(() => {
    if (videoPlayerRef.current) {
      const el = videoPlayerRef.current.getVideoElement();
      if (el !== videoElementRef.current) {
        console.log('[PlayerPage] 🔄 同步video元素:', el ? `readyState=${el.readyState}` : 'null');
        videoElementRef.current = el;
      }
    }
  }, []);

  useEffect(() => {
    syncVideoRef();
    const timer = setInterval(syncVideoRef, 1000);
    return () => clearInterval(timer);
  }, [syncVideoRef]);

  // 🔧 修复：确保useFrameSampler能获取到最新的video元素
  // 使用回调ref模式，直接传递一个动态的ref对象
  const getVideoRef = useCallback(() => videoElementRef, []);

  // 每次打开页面自动弹出引导流程
  useEffect(() => {
    if (!hasOnboarded) {
      setShowOnboarding(true);
    }
  }, [hasOnboarded]);

  // 监听全屏状态
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ==================== AI 视觉 Reaction 引擎 ====================
  const {
    frames,
    latestFrame,
    isSampling,
  } = useFrameSampler(videoElementRef, {
    interval: 3,
    maxFrames: 4,
    quality: 0.6,
    outputWidth: 512,
    enabled: settings.enabled,
  });

  const {
    aiReactions,
    isGenerating,
    speakingText,
    currentEmotion: aiEmotion,
    isSpeaking,
  } = useAIReactionEngine({
    frames,
    latestFrame,
    enabled: settings.enabled,
  });

  // 同步 latestFrame 到 Context
  useEffect(() => {
    setLatestFrame(latestFrame);
  }, [latestFrame, setLatestFrame]);

  // ==================== 显示逻辑 ====================
  const showDanmaku = settings.enabled && (settings.reactionMode === 'danmaku' || settings.reactionMode === 'both');
  const showSubtitle = settings.enabled && (settings.reactionMode === 'voice' || settings.reactionMode === 'both');

  // 当前情绪
  const currentEmotion: EmotionType = aiEmotion;

  /** AI陪看按钮点击 */
  const handleAiCompanionClick = useCallback(() => {
    if (!hasOnboarded) {
      // 首次使用，展示引导弹窗
      setShowOnboarding(true);
    } else {
      // 已引导过，直接切换开关
      toggleCompanion();
    }
  }, [hasOnboarded, toggleCompanion]);

  /** 全屏切换（整个播放区域） */
  const handleFullscreen = useCallback(() => {
    const area = playerAreaRef.current;
    if (!area) return;
    if (!document.fullscreenElement) {
      area.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  return (
    <div className="w-full min-h-screen flex flex-col bg-txv-bg">
      {/* 顶部导航（全屏时隐藏） */}
      {!isFullscreen && <Header />}

      {/* 主内容区 - 限制最大宽度并居中 */}
      <div className="flex-1 flex w-full max-w-[1440px] mx-auto">
        {/* 左侧：播放器 + 评价区 */}
        <div className="flex-1 min-w-0">
          {/* ★★★ 播放器 + AI陪看 区域（全屏时整体全屏） ★★★ */}
          <div
            ref={playerAreaRef}
            className={`relative w-full ${isFullscreen ? 'h-screen bg-black flex' : ''}`}
          >
            {/* 视频播放器 */}
            <div className={`relative ${isFullscreen ? 'flex-1 h-full flex flex-col items-center justify-center' : 'w-full'}`}>
              <VideoPlayer
                ref={videoPlayerRef}
                onAiCompanionClick={handleAiCompanionClick}
                onFullscreenToggle={handleFullscreen}
                externalFullscreen={isFullscreen}
              />

              {/* AI Reaction 弹幕覆盖 */}
              {showDanmaku && !isFullscreen && aiReactions.length > 0 && (
                <ReactionOverlay reactions={aiReactions} />
              )}

              {/* 非全屏时的虚拟角色小窗 */}
              {!isFullscreen && (
                <CompanionAvatar currentEmotion={currentEmotion} />
              )}

              {/* AI 状态指示器（非全屏） */}
              {settings.enabled && !isFullscreen && (isSampling || isGenerating) && (
                <div className="absolute top-12 left-4 z-30 flex items-center gap-2">
                  {isGenerating && (
                    <div className="flex items-center gap-1.5 glass-effect-subtle rounded-full px-3 py-1.5 text-[11px] text-txv-orange shadow-lg">
                      <span className="w-2 h-2 bg-txv-orange rounded-full animate-pulse shadow-[0_0_8px_rgba(255,106,0,0.5)]" />
                      AI 正在观看...
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* ★★★ 全屏时的 AI 陪看侧边栏（Zoom 会议风格分窗，可折叠） ★★★ */}
            {isFullscreen && settings.enabled && !fsSidebarCollapsed && (
              <div className="w-[280px] h-full flex flex-col flex-shrink-0 border-l border-white/[0.06] particles-bg relative"
                style={{ background: 'linear-gradient(180deg, #12122a 0%, #0d0d1a 100%)' }}
              >
                {/* 折叠按钮（垂直居中于侧边栏左缘） */}
                <button
                  onClick={() => setFsSidebarCollapsed(true)}
                  aria-label="折叠AI陪看侧边栏"
                  className="absolute top-1/2 -left-3 -translate-y-1/2 z-30 w-6 h-12 bg-[#1A1A1A]/90 hover:bg-[#2A2A2A] border border-white/10 rounded-l-md flex items-center justify-center text-white/70 hover:text-white transition-colors shadow-lg backdrop-blur-sm"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {/* 顶部：角色信息 */}
                <div className="p-4 border-b border-white/[0.06] flex items-center gap-3 backdrop-blur-sm">
                  <div className="w-12 h-12 rounded-full overflow-hidden shadow-lg ring-2 ring-txv-orange/50 animate-breathe-subtle">
                    <img
                      src={(PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0]).avatarUrl}
                      alt="AI角色"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="text-white font-medium text-sm">
                      {(PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0]).name}
                    </div>
                    <div className="text-txv-orange text-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
                      {isSpeaking ? '正在说话...' : isGenerating ? '思考中...' : '陪看中'}
                    </div>
                  </div>
                </div>

                {/* 中间：虚拟角色大图 */}
                <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                  {/* 径向渐变光效背景 */}
                  <div className="absolute inset-0 pointer-events-none" 
                    style={{ background: 'radial-gradient(circle at 50% 40%, rgba(76,201,240,0.06) 0%, transparent 70%)' }} 
                  />
                  <div className="relative">
                    <div
                      className="w-36 h-36 rounded-full overflow-hidden shadow-2xl transition-all duration-500"
                      style={{
                        borderWidth: 3,
                        borderStyle: 'solid',
                        borderColor: isSpeaking
                          ? (PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0]).color
                          : 'rgba(76, 201, 240, 0.4)',
                        boxShadow: isSpeaking
                          ? `0 0 30px ${(PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0]).color}40`
                          : '0 0 20px rgba(76, 201, 240, 0.15)',
                        animation: isSpeaking ? 'pulse 1.5s ease-in-out infinite' : 'none',
                      }}
                    >
                      <img
                        src={(PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0]).avatarUrl}
                        alt="AI角色"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {/* 语音波纹动画 - 升级为更流畅的效果 */}
                    {isSpeaking && (
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-[3px]">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className="w-[3px] bg-gradient-to-t from-txv-orange to-txv-orange-light rounded-full"
                            style={{
                              animation: `soundWave 0.6s ease-in-out infinite`,
                              animationDelay: `${i * 0.1}s`,
                              height: '10px',
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 字幕区域 - 升级为毛玻璃卡片 */}
                  <div className="mt-6 w-full min-h-[80px] flex items-center justify-center">
                    {speakingText ? (
                      <div className="glass-effect-light rounded-xl px-4 py-3 w-full animate-fade-in-up">
                        <p className="text-white text-sm leading-relaxed text-center"
                          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                        >
                          "{speakingText}"
                        </p>
                      </div>
                    ) : isGenerating ? (
                      <div className="flex items-center gap-2 text-white/40 text-sm">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-txv-blue-light/60 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                          <span className="w-1.5 h-1.5 bg-txv-blue-light/60 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                          <span className="w-1.5 h-1.5 bg-txv-blue-light/60 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                        </div>
                        正在观看画面...
                      </div>
                    ) : (
                      <p className="text-white/25 text-xs text-center animate-subtle-float">AI 正在认真观看中</p>
                    )}
                  </div>
                </div>

                {/* 底部：最近的 Reaction 历史 - 增加滑入动画 */}
                <div className="p-3 border-t border-white/[0.06] max-h-[120px] overflow-y-auto scrollbar-hide">
                  <div className="text-white/30 text-[10px] mb-2 uppercase tracking-wider">最近评论</div>
                  {aiReactions.slice(-3).map((r, idx) => (
                    <div key={r.id} className="text-white/60 text-xs mb-1.5 leading-relaxed animate-slide-in-bottom"
                      style={{ animationDelay: `${idx * 0.1}s` }}
                    >
                      <span className="text-txv-orange mr-1.5 text-[10px]">●</span>
                      {r.text}
                    </div>
                  ))}
                  {aiReactions.length === 0 && (
                    <div className="text-white/20 text-xs italic">还没有评论哦~</div>
                  )}
                </div>
              </div>
            )}

            {/* 全屏 + 侧边栏折叠时：右上角"AI陪看"小入口（点击展开） */}
            {isFullscreen && settings.enabled && fsSidebarCollapsed && (
              <button
                onClick={() => setFsSidebarCollapsed(false)}
                aria-label="展开AI陪看侧边栏"
                className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-black/60 hover:bg-black/75 backdrop-blur-sm border border-white/10 rounded-full pl-1.5 pr-3 py-1.5 text-white/90 transition-colors shadow-lg"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden ring-2 ring-txv-orange/60">
                  <img
                    src={(PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0]).avatarUrl}
                    alt="AI角色"
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-[12px]">AI陪看</span>
                <svg className="w-3 h-3 text-white/60" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {(isSpeaking || isGenerating) && (
                  <span className="w-1.5 h-1.5 bg-txv-orange rounded-full animate-pulse" />
                )}
              </button>
            )}

            {/* 全屏时的状态指示 */}
            {isFullscreen && settings.enabled && !fsSidebarCollapsed && isGenerating && (
              <div className="absolute top-4 left-4 z-30">
                <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 text-[11px] text-txv-orange">
                  <span className="w-1.5 h-1.5 bg-txv-orange rounded-full animate-pulse" />
                  AI 正在观看...
                </div>
              </div>
            )}
          </div>

          {/* 用户评价区（全屏时隐藏） */}
          {!isFullscreen && <UserReviews />}
        </div>

        {/* 右侧：剧集信息面板（全屏时隐藏，可折叠） */}
        {!isFullscreen && (
          <div
            className="flex-shrink-0 border-l border-white/5 relative transition-all duration-300 ease-in-out"
            style={{ width: nonFsSidebarCollapsed ? 0 : 'var(--sidebar-width, 300px)' }}
          >
            <button
              onClick={() => setNonFsSidebarCollapsed(v => !v)}
              aria-label={nonFsSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
              className="absolute top-4 -left-3 z-20 w-6 h-12 bg-[#1A1A1A] hover:bg-[#2A2A2A] border border-white/10 rounded-l-md flex items-center justify-center text-white/60 hover:text-white transition-colors shadow-lg"
            >
              <svg
                className={`w-3 h-3 transition-transform duration-300 ${nonFsSidebarCollapsed ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div
              className="h-full overflow-hidden"
              style={{ width: nonFsSidebarCollapsed ? 0 : 'var(--sidebar-width, 300px)' }}
            >
              <EpisodeInfoPanel />
            </div>
          </div>
        )}
      </div>

      {/* 对话面板 */}
      <ChatPanel />

      {/* 设置面板 */}
      <SettingsPanel />

      {/* 首次引导弹窗 */}
      <OnboardingDialog
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      {/* 全局动画 CSS */}
      <style>{`
        @keyframes soundWave {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
      `}</style>
    </div>
  );
}
