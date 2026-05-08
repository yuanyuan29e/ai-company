/** 剧情节点类型 */
export type SceneNodeType = 'highlight' | 'heartbreak' | 'foreshadow' | 'comedy';

/** AI 人格类型 — 5种拟人化角色 */
export type PersonaType = 'explorer' | 'empath' | 'director' | 'roaster' | 'timekeeper';

/** Reaction 呈现形式 */
export type ReactionMode = 'danmaku' | 'voice' | 'both';

/** Reaction 频率 */
export type ReactionFrequency = 'high' | 'medium' | 'low';

/** 情感标签 - 驱动虚拟角色表情动画 */
export type EmotionType =
  | 'happy' | 'surprised' | 'sad' | 'laugh' | 'think' | 'neutral'
  | 'excited' | 'worried' | 'moved' | 'skeptical' | 'focused';

/** 剧情节点 - 预处理生成的核心数据结构 */
export interface SceneNode {
  id: string;
  /** 触发时间点（秒） */
  timestamp: number;
  /** Reaction 展示时长（秒） */
  duration: number;
  /** 节点类型 */
  type: SceneNodeType;
  /** 5 种人格对应的 Reaction 文本 */
  reactions: Record<PersonaType, string>;
  /** 截至此刻的剧情摘要（用于防剧透对话上下文） */
  plotSummaryUntilNow: string;
  /** 情感标签，驱动角色表情动画 */
  emotion: EmotionType;
}

/** AI 陪看全局设置 */
export interface CompanionSettings {
  /** 陪看开关 */
  enabled: boolean;
  /** 当前人格（即角色） */
  persona: PersonaType;
  /** Reaction 频率 */
  reactionFrequency: ReactionFrequency;
  /** 呈现形式 */
  reactionMode: ReactionMode;
  /** 音量 0-100 */
  volume: number;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 是否正在流式生成中 */
  isStreaming?: boolean;
  timestamp: number;
}

/** 活跃的 Reaction 弹幕 */
export interface ActiveReaction {
  id: string;
  text: string;
  type: SceneNodeType;
  emotion: EmotionType;
  /** 弹幕创建时间（Date.now()） */
  createdAt: number;
  /** 展示时长（毫秒） */
  duration: number;
}

/** 人格配置详情 */
export interface PersonaConfig {
  type: PersonaType;
  name: string;
  /** 角色头像图片路径 */
  avatarUrl: string;
  description: string;
  color: string;
  /** 角色特长标签 */
  skills: string[];
  /** TTS 语音音色 ID（腾讯云 TTS voiceType） */
  voiceType?: number;
  /** 是否支持情感化语音（仅 601008/601009/601010 支持） */
  supportsEmotion?: boolean;
}

/** 播放器状态 */
export interface PlayerState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  isSeeking: boolean;
}

/** 剧集信息 */
export interface EpisodeInfo {
  id: string;
  title: string;
  seriesName: string;
  episodeNumber: number;
  totalEpisodes: number;
  rating: number;
  description: string;
  coverUrl: string;
  videoUrl: string;
}

/** 频率间隔配置（毫秒） */
export const FREQUENCY_INTERVALS: Record<ReactionFrequency, number> = {
  high: 500,
  medium: 1000,
  low: 2000,
};

/** 人格配置列表 — 5种「剧搭子」角色 */
export const PERSONA_CONFIGS: PersonaConfig[] = [
  {
    type: 'explorer',
    name: '阿探',
    avatarUrl: '/avatars/explorer.png',
    description: '伏笔细节全揪出，反转绝不被剧透',
    color: '#4CC9F0',
    skills: ['线索揪出', '伏笔预警', '反转预测'],
    voiceType: 502006, // 智小悟（聊天男声，适合推理分析）
    supportsEmotion: false,
  },
  {
    type: 'empath',
    name: '糖糖',
    avatarUrl: '/avatars/empath.png',
    description: '陪你哭陪你笑，嗑糖虐恋都懂你',
    color: '#FF69B4',
    skills: ['情绪共鸣', '嗑糖尖叫', '虐心安慰'],
    voiceType: 603007, // 邻家女孩（聊天女声）
    supportsEmotion: false,
  },
  {
    type: 'director',
    name: '戏骨哥',
    avatarUrl: '/avatars/director.png',
    description: '镜头门道我懂行，带你看剧不白看',
    color: '#9B59B6',
    skills: ['镜头解读', '演技点评', '服化道鉴赏'],
    voiceType: 502005, // 智小解（解说男声，专业有质感）
    supportsEmotion: false,
  },
  {
    type: 'roaster',
    name: '乐子人',
    avatarUrl: '/avatars/roaster.png',
    description: '嘴替已就位，追剧快乐加倍',
    color: '#FF6A00',
    skills: ['吐槽玩梗', '气氛担当', '快乐源泉'],
    voiceType: 602005, // 专业梓欣（超自然聊天女声，活泼有特色）
    supportsEmotion: false,
  },
  {
    type: 'timekeeper',
    name: '小理',
    avatarUrl: '/avatars/timekeeper.png',
    description: '人物关系理清楚，长篇追剧不迷路',
    color: '#00BCD4',
    skills: ['关系梳理', '时间线整理', '背景补充'],
    voiceType: 603005, // 知心大林（聊天男声，温和清晰适合梳理叙述）
    supportsEmotion: false,
  },
];

/**
 * 情感映射表：将项目 EmotionType 映射到腾讯云 TTS EmotionCategory
 * 用于情感化音色（601008/601009/601010）的动态情感切换
 */
export const EMOTION_TO_TTS_CATEGORY: Record<EmotionType, string> = {
  happy: 'happy',
  excited: 'happy',
  laugh: 'happy',
  surprised: 'surprise',
  sad: 'sad',
  moved: 'sad',
  worried: 'fear',
  think: 'calm',
  focused: 'calm',
  skeptical: 'neutral',
  neutral: 'neutral',
};

/**
 * 情感对应的语速调节：不同情绪下的语速差异化，使语音更自然
 * Speed 范围：-2 到 6（0为标准语速）
 */
export const EMOTION_TO_SPEED: Record<EmotionType, number> = {
  happy: 1,
  excited: 1,
  laugh: 1,
  surprised: 0,
  sad: -1,
  moved: 0,
  worried: 0,
  think: 0,
  focused: 0,
  skeptical: 0,
  neutral: 0,
};
