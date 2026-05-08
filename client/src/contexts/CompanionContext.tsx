import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  CompanionSettings,
  PersonaType,
  ReactionFrequency,
  ReactionMode,
  PlayerState,
} from '@/types';

interface CompanionContextType {
  /** AI陪看设置 */
  settings: CompanionSettings;
  /** 播放器状态 */
  playerState: PlayerState;
  /** 是否已完成首次引导 */
  hasOnboarded: boolean;
  /** 是否显示设置面板 */
  showSettings: boolean;
  /** 是否显示聊天面板 */
  showChat: boolean;
  /** 最新视频帧 Base64（供视觉增强对话使用） */
  latestFrame: string | null;
  /** 切换陪看开关 */
  toggleCompanion: () => void;
  /** 更新人格 */
  setPersona: (persona: PersonaType) => void;
  /** 更新Reaction频率 */
  setReactionFrequency: (freq: ReactionFrequency) => void;
  /** 更新呈现形式 */
  setReactionMode: (mode: ReactionMode) => void;
  /** 更新音量 */
  setVolume: (volume: number) => void;
  /** 更新播放器状态 */
  updatePlayerState: (state: Partial<PlayerState>) => void;
  /** 完成引导 */
  completeOnboarding: () => void;
  /** 切换设置面板 */
  toggleSettings: () => void;
  /** 切换聊天面板 */
  toggleChat: () => void;
  /** 设置聊天面板显示 */
  setShowChat: (show: boolean) => void;
  /** 更新最新视频帧 */
  setLatestFrame: (frame: string | null) => void;
}

const defaultSettings: CompanionSettings = {
  enabled: false,
  persona: 'empath',
  reactionFrequency: 'medium',
  reactionMode: 'both',
  volume: 80,
};

const defaultPlayerState: PlayerState = {
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  playbackRate: 1,
  isSeeking: false,
};

const CompanionContext = createContext<CompanionContextType | null>(null);

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompanionSettings>(defaultSettings);
  const [playerState, setPlayerState] = useState<PlayerState>(defaultPlayerState);
  // 每次打开页面都重新进入引导流程
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [latestFrame, setLatestFrame] = useState<string | null>(null);

  const toggleCompanion = useCallback(() => {
    setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const setPersona = useCallback((persona: PersonaType) => {
    setSettings(prev => ({ ...prev, persona }));
  }, []);

  const setReactionFrequency = useCallback((reactionFrequency: ReactionFrequency) => {
    setSettings(prev => ({ ...prev, reactionFrequency }));
  }, []);

  const setReactionMode = useCallback((reactionMode: ReactionMode) => {
    setSettings(prev => ({ ...prev, reactionMode }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    setSettings(prev => ({ ...prev, volume: Math.max(0, Math.min(100, volume)) }));
  }, []);

  const updatePlayerState = useCallback((state: Partial<PlayerState>) => {
    setPlayerState(prev => ({ ...prev, ...state }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setHasOnboarded(true);
    setSettings(prev => ({ ...prev, enabled: true }));
    try {
      localStorage.setItem('ai-companion-onboarded', 'true');
    } catch {
      // 忽略 localStorage 不可用的情况
    }
  }, []);

  const toggleSettings = useCallback(() => {
    setShowSettings(prev => !prev);
  }, []);

  const toggleChat = useCallback(() => {
    setShowChat(prev => !prev);
  }, []);

  return (
    <CompanionContext.Provider
      value={{
        settings,
        playerState,
        hasOnboarded,
        showSettings,
        showChat,
        latestFrame,
        toggleCompanion,
        setPersona,
        setReactionFrequency,
        setReactionMode,
        setVolume,
        updatePlayerState,
        completeOnboarding,
        toggleSettings,
        toggleChat,
        setShowChat,
        setLatestFrame,
      }}
    >
      {children}
    </CompanionContext.Provider>
  );
}

export function useCompanion() {
  const context = useContext(CompanionContext);
  if (!context) {
    throw new Error('useCompanion must be used within a CompanionProvider');
  }
  return context;
}
