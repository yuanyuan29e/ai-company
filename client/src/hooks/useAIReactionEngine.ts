import { useState, useEffect, useRef, useCallback } from 'react';
import { ActiveReaction, PersonaType, ReactionFrequency, EmotionType, SceneNodeType, PERSONA_CONFIGS, EMOTION_TO_TTS_CATEGORY, EMOTION_TO_SPEED } from '@/types';
import { streamVisionReaction, requestTTS } from '@/services/api';
import { useCompanion } from '@/contexts/CompanionContext';

interface AIReactionEngineOptions {
  /** 视频帧数组（由 useFrameSampler 提供） */
  frames: string[];
  /** 最新一帧（由 useFrameSampler 提供，作为frames为空时的后备） */
  latestFrame?: string | null;
  /** 是否启用 AI Reaction */
  enabled?: boolean;
  /** AI Reaction 生成间隔（秒），默认 3 */
  reactionInterval?: number;
  /** 最大并发请求数，默认 1 */
  maxConcurrent?: number;
}

interface AIReactionEngineResult {
  /** AI 生成的活跃 Reaction 列表（仍保留用于 UI 字幕显示） */
  aiReactions: ActiveReaction[];
  /** 是否正在生成 Reaction */
  isGenerating: boolean;
  /** 当前正在朗读的文本（用于字幕式展示） */
  speakingText: string;
  /** 当前情绪 */
  currentEmotion: EmotionType;
  /** 清除所有 AI Reaction */
  clearAIReactions: () => void;
  /** 手动触发一次 AI Reaction */
  triggerReaction: () => void;
  /** 之前生成的 Reaction 文本列表 */
  reactionHistory: string[];
  /** 是否正在播放语音 */
  isSpeaking: boolean;
  /** 统计信息 */
  stats: {
    totalGenerated: number;
    successRate: number;
  };
}

/**
 * 根据 Reaction 文本智能推断情感类型
 */
function inferEmotion(text: string): EmotionType {
  if (/哈|笑|😂|🤣|有趣|好玩|绝了/.test(text)) return 'laugh';
  if (/哇|！|等等|天|我去|震惊|意想不到/.test(text)) return 'surprised';
  if (/感动|心疼|泪|哭|难过|💗|😢/.test(text)) return 'sad';
  if (/美|暖|开心|好看|太好|治愈|💛|🌟|☕/.test(text)) return 'happy';
  if (/注意|分析|结构|线索|推测|镜头|叙事/.test(text)) return 'think';
  return 'neutral';
}

/**
 * 根据文本内容推断节点类型
 */
function inferNodeType(text: string): SceneNodeType {
  if (/哈|笑|😂|🤣|搞笑|段子|吐槽/.test(text)) return 'comedy';
  if (/感动|心疼|泪|哭|虐|难过/.test(text)) return 'heartbreak';
  if (/伏笔|暗示|线索|预测|隐藏/.test(text)) return 'foreshadow';
  return 'highlight';
}

/**
 * 使用 Web Speech API 合成语音（浏览器内置 TTS，作为后备方案）
 */
function speakWithWebSpeech(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    // 清除 emoji 和特殊字符，保留纯文本
    const cleanText = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    if (!cleanText) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.1;  // 稍微快一点
    utterance.pitch = 1.0;
    utterance.volume = 0.8;

    // 尝试选择中文女声
    const voices = speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh') && v.name.includes('Female'))
      || voices.find(v => v.lang.startsWith('zh'))
      || voices[0];
    if (zhVoice) utterance.voice = zhVoice;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    speechSynthesis.speak(utterance);
  });
}

/**
 * 使用服务端 TTS 或浏览器 Web Speech API 播放语音
 */
async function playReactionAudio(text: string, voiceType: number = 502001): Promise<void> {
  // 截断过长文本（TTS 对超长文本可能失败）
  const truncatedText = text.length > 100 ? text.slice(0, 100) : text;
  
  try {
    console.log('[TTS] 请求语音合成, 文本长度:', truncatedText.length, ', voiceType:', voiceType);
    const result = await requestTTS(truncatedText, voiceType);
    console.log('[TTS] 响应类型:', result.type);
    if (result.type === 'audio') {
      // 服务端 TTS 成功，播放音频
      const audioUrl = URL.createObjectURL(result.data);
      const audio = new Audio(audioUrl);
      audio.volume = 0.8;
      return new Promise((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = (e) => {
          console.warn('[TTS] 音频播放失败:', e);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.play().catch((e) => {
          console.warn('[TTS] audio.play() 失败:', e);
          resolve();
        });
      });
    } else {
      console.warn('[TTS] 返回非音频类型，尝试 Web Speech 降级');
    }
  } catch (e) {
    console.warn('[TTS] 请求失败:', e);
  }

  // 降级：使用浏览器内置 Web Speech API
  await speakWithWebSpeech(truncatedText);
}

/**
 * AI Reaction 引擎 Hook
 *
 * 核心链路（借鉴 LiveCC）：
 * 视频帧采样 → 多模态 AI 理解 → 人格化 Reaction → 语音播报
 *
 * 改进：
 * - 主要通过语音输出 Reaction，不再以弹幕为主
 * - 保留 speakingText 供 UI 显示字幕（在角色小窗旁）
 */
export function useAIReactionEngine({
  frames,
  latestFrame,
  enabled = true,
  reactionInterval = 3,
  maxConcurrent = 1,
}: AIReactionEngineOptions): AIReactionEngineResult {
  const { settings, playerState } = useCompanion();

  // 🔧 调试：打印接收到的frames和latestFrame
  console.log(`[AIReactionEngine] 初始化: frames=${frames?.length || 0}, latestFrame=${latestFrame ? '有' : '无'}`);
  const [aiReactions, setAIReactions] = useState<ActiveReaction[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingText, setSpeakingText] = useState('');
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>('neutral');
  const [reactionHistory, setReactionHistory] = useState<string[]>([]);
  const [stats, setStats] = useState({ totalGenerated: 0, successRate: 1 });

  const activeRequestsRef = useRef(0);
  const lastTriggerTimeRef = useRef(0);
  const reactionIdRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  // 语音播放队列（支持不同人格音色）
  const speechQueueRef = useRef<{ text: string; voiceType: number }[]>([]);
  const isProcessingSpeechRef = useRef(false);

  const { persona, reactionFrequency, reactionMode } = settings;
  const { currentTime, isPlaying, isSeeking } = playerState;

  /**
   * 处理语音播放队列
   */
  const processSpeechQueue = useCallback(async () => {
    if (isProcessingSpeechRef.current) return;
    if (speechQueueRef.current.length === 0) {
      setIsSpeaking(false);
      setSpeakingText('');
      return;
    }

    isProcessingSpeechRef.current = true;
    setIsSpeaking(true);

    while (speechQueueRef.current.length > 0) {
      const item = speechQueueRef.current.shift()!;
      setSpeakingText(item.text);
      await playReactionAudio(item.text, item.voiceType);
    }

    isProcessingSpeechRef.current = false;
    setIsSpeaking(false);
    setSpeakingText('');
  }, []);

  /**
   * 将文本加入语音播放队列
   */
  const enqueueSpeech = useCallback((text: string, voiceType: number = 502001) => {
    speechQueueRef.current.push({ text, voiceType });
    processSpeechQueue();
  }, [processSpeechQueue]);

  /**
   * 根据频率设置调整 Reaction 生成间隔
   * 注意：多Agent流程本身需要2-3s，这里只是两次"发起请求"之间的最小间隔
   * medium(适中) = 每6s尝试一次, high(高) = 每4s, low(低) = 每12s
   */
  const getAdjustedInterval = useCallback((): number => {
    const freq = reactionFrequency as ReactionFrequency;
    const baseInterval = 6; // 基础间隔6秒
    const multiplier = freq === 'high' ? 0.65 : freq === 'low' ? 2 : 1;
    return baseInterval * multiplier;
  }, [reactionFrequency]);

  /**
   * 触发一次 AI Reaction 生成
   */
  const triggerReaction = useCallback(() => {
    // 防止并发过多
    if (activeRequestsRef.current >= maxConcurrent) {
      console.log('[AIReaction] ⏸ 跳过: 已有并发请求');
      return;
    }
    // 🔧 修复：使用 latestFrame 作为后备，确保有帧数据
    const effectiveFrames = frames.length > 0 ? frames : (latestFrame ? [latestFrame] : []);
    if (effectiveFrames.length === 0) {
      console.log('[AIReaction] ⏸ 跳过: 无帧数据 (frames和latestFrame都为空)');
      return;
    }
    // 正在语音播放时，如果队列已有2条以上则不生成新的（避免过度堆积）
    if (isSpeaking && speechQueueRef.current.length >= 2) {
      console.log('[AIReaction] ⏸ 跳过: 语音队列满');
      return;
    }

    const now = Date.now();
    const minInterval = getAdjustedInterval() * 1000;

    // 节流：距离上次触发不足设定间隔
    if (now - lastTriggerTimeRef.current < minInterval) {
      console.log(`[AIReaction] ⏸ 节流: 距上次${Math.round((now - lastTriggerTimeRef.current)/1000)}s < ${Math.round(minInterval/1000)}s`);
      return;
    }

    lastTriggerTimeRef.current = now;
    activeRequestsRef.current++;
    setIsGenerating(true);

    console.log(`[AIReaction] 🚀 发起请求 | time=${currentTime}s | frames=${effectiveFrames.length} | persona=${persona}`);

    let fullText = '';
    const reactionId = `ai-${++reactionIdRef.current}-${Date.now()}`;

    streamVisionReaction(
      {
        frames: effectiveFrames.slice(-2),  // 只发送最新2帧，保证时效性
        persona: persona as string,
        episodeId: 'jiaoou-ep-01',
        currentTime,
        previousReactions: reactionHistory.slice(-5),
      },
      // onChunk: 逐 token 累积文本
      (chunk: string) => {
        fullText += chunk;
      },
      // onDone: 完成后播放语音
      () => {
        activeRequestsRef.current--;
        setIsGenerating(activeRequestsRef.current > 0);

        if (fullText.trim()) {
          const text = fullText.trim();

          // AI 判断无需发言时，静默跳过
          if (text === '[SKIP]' || text.includes('[SKIP]')) {
            console.log('[AIReaction] ⏭️ SKIP（画面无需反应）| time=', currentTime);
            return;
          }

          // 异常内容过滤：拦截模型输出的非弹幕内容
          if (
            text.includes('@image:') ||        // 图片引用（模型幻觉）
            text.includes('image.') ||          // 图片文件名
            text.includes('.png') ||            // 图片后缀
            text.includes('.jpg') ||
            text.includes('http') ||            // URL
            text.includes('```') ||             // 代码块
            text.length > 50 ||                 // 超长文本（弹幕不应超过50字符）
            /^[\s\p{P}\p{S}]*$/u.test(text) || // 纯符号/空白（支持中文，\W会误杀中文字符）
            text.includes('画面中') ||           // 描述性文字
            text.includes('场景是') ||
            text.includes('图片展示')
          ) {
            console.log('[AIReaction] 🚫 过滤异常内容:', text.slice(0, 50), `(len=${text.length})`);
            return;
          }

          // 去重检测：如果和最近的弹幕内容过于相似则跳过
          const isDuplicate = reactionHistory.slice(-5).some(prev => {
            // 完全相同
            if (prev === text) return true;
            // 包含关系（一个是另一个的子串）
            if (prev.includes(text) || text.includes(prev)) return true;
            // 高相似度：共同字符超过70%
            const commonChars = [...text].filter(c => prev.includes(c)).length;
            return commonChars / Math.max(text.length, prev.length) > 0.7;
          });

          if (isDuplicate) {
            console.log('[AIReaction] 检测到重复弹幕，跳过:', text);
            return;
          }

          const emotion = inferEmotion(text);
          const type = inferNodeType(text);

          setCurrentEmotion(emotion);

          // 添加到 Reaction 列表（用于字幕显示）
          const reaction: ActiveReaction = {
            id: reactionId,
            text,
            type,
            emotion,
            createdAt: Date.now(),
            duration: 15000,
          };
          setAIReactions(prev => [...prev, reaction]);

          // 加入语音播放队列（仅 voice 或 both 模式）— 支持情感自适应
          if (reactionMode === 'voice' || reactionMode === 'both') {
            const personaConfig = PERSONA_CONFIGS.find(p => p.type === persona);
            const voiceType = personaConfig?.voiceType || 602003;
            // 情感型角色：传入情感参数和动态语速
            const emotionCategory = personaConfig?.supportsEmotion
              ? EMOTION_TO_TTS_CATEGORY[emotion] || 'neutral'
              : undefined;
            const speed = personaConfig?.supportsEmotion
              ? EMOTION_TO_SPEED[emotion] || 0
              : undefined;
            enqueueSpeech(text, voiceType, emotionCategory, speed);
          }

          setReactionHistory(prev => [...prev.slice(-19), text]);
          setStats(prev => ({
            totalGenerated: prev.totalGenerated + 1,
            successRate: (prev.successRate * prev.totalGenerated + 1) / (prev.totalGenerated + 1),
          }));
        }
      },
      // onError: 失败处理
      (error: string) => {
        console.warn('[AIReaction] 生成失败:', error);
        activeRequestsRef.current--;
        setIsGenerating(activeRequestsRef.current > 0);
        // 错误后也更新时间，避免连续重试
        lastTriggerTimeRef.current = Date.now();
        setStats(prev => ({
          ...prev,
          successRate: (prev.successRate * prev.totalGenerated) / (prev.totalGenerated + 1),
        }));
      }
    );
  }, [frames, persona, currentTime, reactionHistory, maxConcurrent, getAdjustedInterval, isSpeaking, enqueueSpeech, reactionMode]);

  // 用 ref 保存最新的 triggerReaction，避免依赖变化导致定时器重建
  const triggerReactionRef = useRef(triggerReaction);
  useEffect(() => {
    triggerReactionRef.current = triggerReaction;
  }, [triggerReaction]);

  /**
   * 自动 Reaction 引擎
   * 视频播放时定时触发 AI Reaction 生成
   */
  useEffect(() => {
    console.log('[AIReaction] 引擎状态检查:', { enabled, isPlaying, isSeeking, framesCount: frames.length });
    if (!enabled || !isPlaying || isSeeking) {
      if (timerRef.current) {
        console.log('[AIReaction] ⛔ 停止定时器 (enabled=', enabled, 'isPlaying=', isPlaying, ')');
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const intervalMs = getAdjustedInterval() * 1000;
    console.log(`[AIReaction] ✅ 引擎启动! 间隔=${intervalMs/1000}s`);

    // 延迟首次触发（等待帧积累）
    const initialDelay = setTimeout(() => {
      console.log('[AIReaction] 🎬 首次触发');
      triggerReactionRef.current();

      timerRef.current = window.setInterval(() => {
        triggerReactionRef.current();
      }, intervalMs);
    }, 500); // 500ms后首次触发

    return () => {
      clearTimeout(initialDelay);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, isPlaying, isSeeking, getAdjustedInterval]);

  /**
   * 定时清除过期的 AI Reaction
   */
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setAIReactions(prev => prev.filter(r => now - r.createdAt < r.duration));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /**
   * 快进/后退时清空
   */
  useEffect(() => {
    if (isSeeking) {
      setAIReactions([]);
      speechQueueRef.current = [];
      // 停止当前语音
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
      }
      setSpeakingText('');
      setIsSpeaking(false);
    }
  }, [isSeeking]);

  /**
   * 暂停时停止语音
   */
  useEffect(() => {
    if (!isPlaying) {
      if ('speechSynthesis' in window) {
        speechSynthesis.pause();
      }
    } else {
      if ('speechSynthesis' in window) {
        speechSynthesis.resume();
      }
    }
  }, [isPlaying]);

  /** 清除所有 AI Reaction */
  const clearAIReactions = useCallback(() => {
    setAIReactions([]);
    speechQueueRef.current = [];
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    setSpeakingText('');
    setIsSpeaking(false);
  }, []);

  return {
    aiReactions,
    isGenerating,
    speakingText,
    currentEmotion,
    clearAIReactions,
    triggerReaction,
    reactionHistory,
    isSpeaking,
    stats,
  };
}
