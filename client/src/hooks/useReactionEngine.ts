import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SceneNode, ActiveReaction, PersonaType, ReactionFrequency, PERSONA_CONFIGS } from '@/types';
import { matchReactionNodes, resetTriggeredAfter } from '@/services/reactionMatcher';
import { useCompanion } from '@/contexts/CompanionContext';
import { requestTTS } from '@/services/api';

interface UseReactionEngineOptions {
  nodes: SceneNode[];
}

/**
 * 使用浏览器 Web Speech API 合成语音
 */
function speakWithWebSpeech(text: string, volume: number = 0.8): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    // 清除 emoji 和特殊字符
    const cleanText = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    if (!cleanText) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    utterance.volume = volume;

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
 * Reaction 弹幕引擎 Hook
 * 负责根据播放进度触发 Reaction、管理弹幕队列
 * 同时支持语音播报（优先服务端TTS，降级浏览器TTS）
 */
export function useReactionEngine({ nodes }: UseReactionEngineOptions) {
  const { settings, playerState } = useCompanion();
  const [activeReactions, setActiveReactions] = useState<ActiveReaction[]>([]);
  const [speakingText, setSpeakingText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const triggeredIdsRef = useRef<Set<string>>(new Set());
  const prevTimeRef = useRef<number>(0);
  const speechQueueRef = useRef<{ text: string; voiceType: number }[]>([]);
  const isProcessingSpeechRef = useRef(false);

  const { persona, reactionFrequency, reactionMode, enabled, volume } = settings;
  const { currentTime, isPlaying, isSeeking } = playerState;

  /** 使用服务端 TTS 播放语音，失败降级到浏览器 Web Speech */
  const playWithServerTTS = useCallback(async (text: string, voiceType: number) => {
    const cleanText = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    if (!cleanText) return;

    try {
      const result = await requestTTS(cleanText, voiceType);
      if (result.type === 'audio') {
        const audioUrl = URL.createObjectURL(result.data);
        const audio = new Audio(audioUrl);
        audio.volume = (volume || 80) / 100;
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(audioUrl); resolve(); };
          audio.play().catch(() => resolve());
        });
        return;
      }
    } catch (e) {
      console.warn('[ReactionEngine TTS] 服务端 TTS 失败，降级到 Web Speech:', e);
    }

    // 降级：浏览器 Web Speech API
    await speakWithWebSpeech(cleanText, (volume || 80) / 100);
  }, [volume]);

  /** 处理语音队列 */
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
      await playWithServerTTS(item.text, item.voiceType, item.emotionCategory, item.speed);
    }

    isProcessingSpeechRef.current = false;
    setIsSpeaking(false);
    setSpeakingText('');
  }, [playWithServerTTS]);

  /** 添加新的 Reaction 到队列 */
  const addReaction = useCallback((node: SceneNode, personaType: PersonaType) => {
    const reactionText = node.reactions[personaType];
    if (!reactionText) return;

    console.log('[ReactionEngine] 触发 Reaction:', reactionText, '| 时间:', node.timestamp, '| 模式:', reactionMode);

    const newReaction: ActiveReaction = {
      id: `${node.id}-${Date.now()}`,
      text: reactionText,
      type: node.type,
      emotion: node.emotion,
      createdAt: Date.now(),
      duration: node.duration * 1000, // 转为毫秒
    };

    setActiveReactions(prev => [...prev, newReaction]);

    // 语音播报（voice 或 both 模式）
    if (reactionMode === 'voice' || reactionMode === 'both') {
      const personaConfig = PERSONA_CONFIGS.find(p => p.type === personaType);
      const voiceType = personaConfig?.voiceType || 602003;
      speechQueueRef.current.push({ text: reactionText, voiceType });
      processSpeechQueue();
    }
  }, [reactionMode, processSpeechQueue]);

  // 使用 ref 存储最新的 addReaction，避免 useEffect 依赖不稳定
  const addReactionRef = useRef(addReaction);
  addReactionRef.current = addReaction;

  /** 清除过期的 Reaction */
  const cleanExpiredReactions = useCallback(() => {
    const now = Date.now();
    setActiveReactions(prev =>
      prev.filter(r => now - r.createdAt < r.duration)
    );
  }, []);

  /** 清空所有 Reaction */
  const clearAllReactions = useCallback(() => {
    setActiveReactions([]);
    speechQueueRef.current = [];
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    setSpeakingText('');
    setIsSpeaking(false);
  }, []);

  /** 主引擎：检测播放进度并触发 Reaction */
  useEffect(() => {
    if (!enabled || !isPlaying || isSeeking || nodes.length === 0) return;

    const matched = matchReactionNodes(
      nodes,
      currentTime,
      triggeredIdsRef.current,
      reactionFrequency as ReactionFrequency
    );

    if (matched.length > 0) {
      console.log('[ReactionEngine] 匹配到', matched.length, '个节点, currentTime:', currentTime.toFixed(1));
    }

    for (const node of matched) {
      addReactionRef.current(node, persona as PersonaType);
    }

    prevTimeRef.current = currentTime;
  }, [currentTime, enabled, isPlaying, isSeeking, nodes, persona, reactionFrequency]);

  /** 定时清除过期弹幕 */
  useEffect(() => {
    const timer = setInterval(cleanExpiredReactions, 500);
    return () => clearInterval(timer);
  }, [cleanExpiredReactions]);

  /** 检测快进/后退，重置触发状态 */
  useEffect(() => {
    if (isSeeking) {
      clearAllReactions();
    }
  }, [isSeeking, clearAllReactions]);

  /** 快进/后退完成后，重新计算已触发节点 */
  useEffect(() => {
    const timeDiff = Math.abs(currentTime - prevTimeRef.current);
    // 如果时间跳跃超过 3 秒，认为是快进/后退
    if (timeDiff > 3) {
      triggeredIdsRef.current = resetTriggeredAfter(
        triggeredIdsRef.current,
        nodes,
        currentTime
      );
      clearAllReactions();
    }
  }, [currentTime, nodes, clearAllReactions]);

  /** 暂停时暂停语音 */
  useEffect(() => {
    if (!isPlaying && 'speechSynthesis' in window) {
      speechSynthesis.pause();
    } else if (isPlaying && 'speechSynthesis' in window) {
      speechSynthesis.resume();
    }
  }, [isPlaying]);

  return {
    activeReactions,
    clearAllReactions,
    speakingText,
    isSpeaking,
  };
}
