import React, { useState } from 'react';
import Draggable from 'react-draggable';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompanion } from '@/contexts/CompanionContext';
import { PERSONA_CONFIGS, EmotionType } from '@/types';
import Live2DAvatar from './Live2DAvatar';

interface CompanionAvatarProps {
  currentEmotion: EmotionType;
  isSpeaking?: boolean;
  isGenerating?: boolean;
}

/** 情感对应的光晕颜色（仅用于非 Live2D 区域的光效） */
const EMOTION_GLOW: Record<EmotionType, string> = {
  happy: '#4CC9F0',
  surprised: '#FFD700',
  sad: '#9B59B6',
  laugh: '#2ECC71',
  think: '#00BCD4',
  neutral: '#4CC9F0',
  excited: '#FF6A00',
  worried: '#E74C3C',
  moved: '#FF69B4',
  skeptical: '#F39C12',
  focused: '#3498DB',
};

export default function CompanionAvatar({ currentEmotion, isSpeaking = false, isGenerating = false }: CompanionAvatarProps) {
  const { settings, toggleSettings } = useCompanion();
  const [isMinimized, setIsMinimized] = useState(false);

  const personaConfig = PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0];
  const glowColor = EMOTION_GLOW[currentEmotion] || EMOTION_GLOW.neutral;

  if (!settings.enabled) return null;

  return (
    <Draggable bounds="parent" handle=".drag-handle">
      <div className="absolute bottom-24 right-4 z-30">
        <AnimatePresence mode="wait">
          {isMinimized ? (
            /* 最小化状态 - Live2D 小头像 */
            <motion.button
              key="minimized"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              onClick={() => setIsMinimized(false)}
              className="cursor-pointer transition-all hover:scale-110"
            >
              <Live2DAvatar
                persona={personaConfig}
                emotion={currentEmotion}
                isSpeaking={isSpeaking}
                size={48}
                showLabel={false}
              />
            </motion.button>
          ) : (
            /* 正常展示状态 - 角色卡片 with Live2D */
            <motion.div
              key="expanded"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="relative"
            >
              <div
                className="drag-handle cursor-move rounded-2xl overflow-visible relative"
                style={{
                  width: 150,
                  background: 'linear-gradient(180deg, rgba(18,18,36,0.95) 0%, rgba(10,10,24,0.98) 100%)',
                  borderWidth: 1.5,
                  borderStyle: 'solid',
                  borderColor: `${personaConfig.color}50`,
                  boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 24px ${glowColor}20, inset 0 1px 0 rgba(255,255,255,0.05)`,
                  transition: 'border-color 0.5s ease, box-shadow 0.5s ease',
                }}
              >
                {/* 顶部微光装饰 */}
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                {/* Live2D 动态角色头像 - 替代静态图片 + emoji */}
                <div className="relative w-full flex items-center justify-center py-3" style={{ minHeight: 130 }}>
                  <Live2DAvatar
                    persona={personaConfig}
                    emotion={currentEmotion}
                    isSpeaking={isSpeaking}
                    isThinking={isGenerating}
                    size={110}
                    showLabel={true}
                  />
                </div>

                {/* 角色名称和状态 */}
                <div className="px-2.5 py-2.5 text-center relative">
                  <div className="text-white text-xs font-semibold truncate">
                    {personaConfig.name}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span
                      className="w-[5px] h-[5px] rounded-full"
                      style={{ 
                        background: personaConfig.color,
                        boxShadow: `0 0 6px ${personaConfig.color}`,
                        animation: 'dot-pulse 2s ease-in-out infinite',
                      }}
                    />
                    <span className="text-[10px] text-white/50">
                      {isSpeaking ? '说话中' : isGenerating ? '思考中' : '陪看中'}
                    </span>
                  </div>
                </div>

                {/* 控制按钮 - 悬浮式设计 */}
                <div className="absolute top-1.5 right-1.5 flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSettings(); }}
                    className="w-5 h-5 rounded-full bg-black/50 backdrop-blur-md hover:bg-white/15 flex items-center justify-center text-white/50 hover:text-white text-[10px] transition-all duration-200"
                  >
                    ⚙
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
                    className="w-5 h-5 rounded-full bg-black/50 backdrop-blur-md hover:bg-white/15 flex items-center justify-center text-white/50 hover:text-white text-[10px] transition-all duration-200"
                  >
                    −
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Draggable>
  );
}
