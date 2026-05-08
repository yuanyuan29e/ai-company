import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmotionType, PersonaConfig } from '@/types';

interface Live2DAvatarProps {
  /** 当前角色配置 */
  persona: PersonaConfig;
  /** 当前情绪 */
  emotion: EmotionType;
  /** 是否正在说话 */
  isSpeaking?: boolean;
  /** 是否正在思考 */
  isThinking?: boolean;
  /** 头像尺寸 (px) */
  size?: number;
  /** 是否显示表情标签 */
  showLabel?: boolean;
}

/** 情绪对应的视觉主题（光效颜色 + 动画强度） */
const EMOTION_THEME: Record<EmotionType, { color: string; label: string; intensity: number; pulse: boolean }> = {
  happy:     { color: '#4CC9F0', label: '开心', intensity: 1.2, pulse: true },
  surprised: { color: '#FFD700', label: '惊讶', intensity: 1.5, pulse: true },
  sad:       { color: '#9B59B6', label: '难过', intensity: 0.6, pulse: false },
  laugh:     { color: '#2ECC71', label: '哈哈', intensity: 1.4, pulse: true },
  think:     { color: '#00BCD4', label: '思考', intensity: 0.8, pulse: false },
  neutral:   { color: '#4CC9F0', label: '',     intensity: 0.5, pulse: false },
  excited:   { color: '#FF6A00', label: '兴奋', intensity: 1.6, pulse: true },
  worried:   { color: '#E74C3C', label: '担忧', intensity: 0.9, pulse: false },
  moved:     { color: '#FF69B4', label: '感动', intensity: 1.1, pulse: true },
  skeptical: { color: '#F39C12', label: '怀疑', intensity: 0.7, pulse: false },
  focused:   { color: '#3498DB', label: '专注', intensity: 0.8, pulse: false },
};

/**
 * Live2D 风格动态角色组件（v2 - 适配写实头像）
 * 
 * 设计理念：不在写实头像上叠加五官图形元素，
 * 而是通过边框光效、呼吸动画、情绪粒子、环形光圈等
 * 外围装饰来传达角色情绪（类似豆包 AI 形象）
 * 
 * 特性：
 * - 情绪驱动的动态光环（颜色 + 亮度随情绪变化）
 * - 呼吸微动效果（scale 动画）
 * - 说话时的脉冲环+音波动画
 * - 头部轻微摇晃增加灵动感
 * - 情绪粒子特效（星星、泪滴、惊叹号等在头像周围飘动）
 * - 情绪标签（发光圆点 + 文字，替代 emoji）
 */
export default function Live2DAvatar({
  persona,
  emotion,
  isSpeaking = false,
  isThinking = false,
  size = 120,
  showLabel = true,
}: Live2DAvatarProps) {
  const [headTilt, setHeadTilt] = useState(0);

  const theme = EMOTION_THEME[emotion] || EMOTION_THEME.neutral;

  // ===== 随机轻微头部摇晃 =====
  useEffect(() => {
    const interval = setInterval(() => {
      setHeadTilt((Math.random() - 0.5) * 4); // -2 到 2 度
    }, 2500 + Math.random() * 1500);
    return () => clearInterval(interval);
  }, []);

  const s = size / 120; // scale factor

  return (
    <div className="relative" style={{ width: size, height: size }}>
      
      {/* 外圈动态光环（情绪驱动颜色变化） */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          boxShadow: [
            `0 0 ${12 * s * theme.intensity}px ${theme.color}30, inset 0 0 ${8 * s}px ${theme.color}10`,
            `0 0 ${24 * s * theme.intensity}px ${theme.color}50, inset 0 0 ${12 * s}px ${theme.color}15`,
            `0 0 ${12 * s * theme.intensity}px ${theme.color}30, inset 0 0 ${8 * s}px ${theme.color}10`,
          ],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 说话时的扩散脉冲环 */}
      <AnimatePresence>
        {isSpeaking && (
          <>
            <motion.div
              key="pulse-ring-1"
              className="absolute inset-0 rounded-full"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
              style={{ border: `${1.5 * s}px solid ${theme.color}` }}
            />
            <motion.div
              key="pulse-ring-2"
              className="absolute inset-0 rounded-full"
              initial={{ scale: 1, opacity: 0.4 }}
              animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
              style={{ border: `${1 * s}px solid ${theme.color}` }}
            />
          </>
        )}
      </AnimatePresence>

      {/* 主体容器 - 带呼吸和头部微动 */}
      <motion.div
        className="relative w-full h-full rounded-full overflow-hidden"
        animate={{
          scale: isSpeaking ? [1, 1.03, 0.98, 1.03, 1] : [1, 1.015, 1],
          rotate: headTilt,
        }}
        transition={{
          scale: { 
            duration: isSpeaking ? 0.8 : 4, 
            repeat: Infinity, 
            ease: 'easeInOut' 
          },
          rotate: { duration: 0.6, ease: 'easeInOut' },
        }}
        style={{
          border: `${2.5 * s}px solid ${theme.color}80`,
          boxShadow: `inset 0 0 ${20 * s}px rgba(0,0,0,0.2)`,
          transition: 'border-color 0.5s ease',
        }}
      >
        {/* 角色头像 */}
        <img
          src={persona.avatarUrl}
          alt={persona.name}
          className="w-full h-full object-cover"
        />

        {/* 情绪色调光效覆盖（不遮挡五官，仅边缘渐变） */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity: [0.03, 0.12 * theme.intensity, 0.03] }}
          transition={{ duration: 3, repeat: Infinity }}
          style={{
            background: `radial-gradient(circle at 50% 50%, transparent 40%, ${theme.color}30 100%)`,
          }}
        />

        {/* 说话时底部音波光效 */}
        {isSpeaking && (
          <div className="absolute bottom-0 left-0 right-0 h-[30%] pointer-events-none">
            <motion.div
              className="w-full h-full"
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              style={{
                background: `linear-gradient(to top, ${theme.color}40 0%, transparent 100%)`,
              }}
            />
          </div>
        )}
      </motion.div>

      {/* 情绪粒子效果（在头像周围飘动，不覆盖面部） */}
      <AnimatePresence>
        {emotion === 'excited' && <ExcitedStars color={theme.color} size={size} />}
        {emotion === 'moved' && <FloatingHearts color={theme.color} size={size} />}
        {emotion === 'laugh' && <LaughSparkles color={theme.color} size={size} />}
        {emotion === 'surprised' && <SurpriseMarks color={theme.color} size={size} />}
        {emotion === 'happy' && <HappyGlow color={theme.color} size={size} />}
        {emotion === 'sad' && <SadDrops color={theme.color} size={size} />}
      </AnimatePresence>

      {/* 情绪标签（发光点 + 文字） */}
      {showLabel && theme.label && (
        <motion.div
          key={emotion}
          initial={{ opacity: 0, y: 5, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', damping: 15 }}
          className="absolute -top-1 -left-1 px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 whitespace-nowrap"
          style={{
            background: `${theme.color}20`,
            color: theme.color,
            backdropFilter: 'blur(8px)',
            border: `1px solid ${theme.color}40`,
            boxShadow: `0 0 10px ${theme.color}25`,
          }}
        >
          <motion.span
            animate={{ scale: [1, 1.4, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: theme.color,
              display: 'inline-block',
              boxShadow: `0 0 6px ${theme.color}`,
            }}
          />
          <span>{theme.label}</span>
        </motion.div>
      )}

      {/* 思考中的加载动画 */}
      {isThinking && (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ y: [0, -5, 0], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: theme.color, boxShadow: `0 0 4px ${theme.color}` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===== 情绪粒子效果（在头像外围飘动，不遮挡面部） =====

/** 兴奋 - 周围飞舞的小星星 */
function ExcitedStars({ color, size }: { color: string; size: number }) {
  const positions = [
    { angle: -30, dist: 0.55 },
    { angle: 20, dist: 0.6 },
    { angle: 70, dist: 0.52 },
    { angle: 150, dist: 0.58 },
    { angle: 210, dist: 0.53 },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none"
    >
      {positions.map((pos, i) => {
        const rad = (pos.angle * Math.PI) / 180;
        const x = size / 2 + Math.cos(rad) * size * pos.dist;
        const y = size / 2 + Math.sin(rad) * size * pos.dist;
        return (
          <motion.div
            key={i}
            className="absolute"
            animate={{
              scale: [0, 1.2, 0],
              opacity: [0, 1, 0],
              rotate: [0, 180, 360],
            }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.35 }}
            style={{
              left: x - 4,
              top: y - 4,
              width: 8,
              height: 8,
              color,
              fontSize: 8,
              textShadow: `0 0 4px ${color}`,
            }}
          >
            ✦
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/** 感动 - 浮动小爱心 */
function FloatingHearts({ color, size }: { color: string; size: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none"
    >
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute"
          animate={{
            y: [0, -size * 0.4],
            x: [(i - 1) * 5, (i - 1) * 8],
            opacity: [0.8, 0],
            scale: [0.6, 1],
          }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
          style={{
            left: size * 0.3 + i * size * 0.15,
            top: size * 0.1,
            fontSize: 10,
            color,
            textShadow: `0 0 4px ${color}60`,
          }}
        >
          ♥
        </motion.div>
      ))}
    </motion.div>
  );
}

/** 大笑 - 闪烁的小光点 */
function LaughSparkles({ color, size }: { color: string; size: number }) {
  const spots = [
    { x: 0.15, y: 0.15 }, { x: 0.8, y: 0.1 }, { x: 0.9, y: 0.6 }, { x: 0.05, y: 0.7 },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none"
    >
      {spots.map((spot, i) => (
        <motion.div
          key={i}
          className="absolute"
          animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.25 }}
          style={{
            left: spot.x * size,
            top: spot.y * size,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      ))}
    </motion.div>
  );
}

/** 惊讶 - 弹出的感叹号 */
function SurpriseMarks({ color, size }: { color: string; size: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute pointer-events-none"
      style={{ top: -4, right: size * 0.1 }}
    >
      <motion.div
        animate={{ y: [0, -6, 0], scale: [0.8, 1.2, 0.8] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        style={{
          fontSize: 14,
          fontWeight: 'bold',
          color,
          textShadow: `0 0 8px ${color}80`,
        }}
      >
        !
      </motion.div>
    </motion.div>
  );
}

/** 开心 - 柔和的外围光圈 */
function HappyGlow({ color, size }: { color: string; size: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.3, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2, repeat: Infinity }}
      className="absolute rounded-full pointer-events-none"
      style={{
        inset: -4,
        border: `1.5px solid ${color}50`,
        boxShadow: `0 0 12px ${color}30`,
      }}
    />
  );
}

/** 难过 - 缓慢下落的点点 */
function SadDrops({ color, size }: { color: string; size: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 pointer-events-none"
    >
      {[0, 1].map(i => (
        <motion.div
          key={i}
          className="absolute"
          animate={{
            y: [0, size * 0.35],
            opacity: [0.6, 0],
          }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.8 }}
          style={{
            left: size * 0.35 + i * size * 0.25,
            top: size * 0.85,
            width: 3,
            height: 6,
            borderRadius: '50% 50% 50% 50% / 30% 30% 70% 70%',
            background: `${color}70`,
          }}
        />
      ))}
    </motion.div>
  );
}
