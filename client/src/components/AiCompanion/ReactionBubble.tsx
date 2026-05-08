import React from 'react';
import { motion } from 'framer-motion';
import { ActiveReaction, SceneNodeType } from '@/types';

/** 节点类型对应的颜色标识 - 升级为渐变色系 */
const TYPE_COLORS: Record<SceneNodeType, { bg: string; bgHover: string; border: string; glow: string; label: string }> = {
  highlight: { 
    bg: 'rgba(255,215,0,0.12)', 
    bgHover: 'rgba(255,215,0,0.18)',
    border: '#FFD700', 
    glow: 'rgba(255,215,0,0.2)',
    label: '✨ 高光' 
  },
  heartbreak: { 
    bg: 'rgba(155,89,182,0.12)', 
    bgHover: 'rgba(155,89,182,0.18)',
    border: '#9B59B6', 
    glow: 'rgba(155,89,182,0.2)',
    label: '💔 虐心' 
  },
  foreshadow: { 
    bg: 'rgba(0,188,212,0.12)', 
    bgHover: 'rgba(0,188,212,0.18)',
    border: '#00BCD4', 
    glow: 'rgba(0,188,212,0.2)',
    label: '🔍 伏笔' 
  },
  comedy: { 
    bg: 'rgba(46,204,113,0.12)', 
    bgHover: 'rgba(46,204,113,0.18)',
    border: '#2ECC71', 
    glow: 'rgba(46,204,113,0.2)',
    label: '😂 搞笑' 
  },
};

interface ReactionBubbleProps {
  reaction: ActiveReaction;
  index: number;
}

export default function ReactionBubble({ reaction, index }: ReactionBubbleProps) {
  const typeStyle = TYPE_COLORS[reaction.type] || TYPE_COLORS.highlight;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.85, x: 10 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.9, x: -5 }}
      transition={{ 
        type: 'spring', 
        damping: 18, 
        stiffness: 300, 
        delay: index * 0.06 
      }}
      className="max-w-[240px] relative group"
    >
      {/* 气泡主体 - 升级为毛玻璃 + 渐变 */}
      <div
        className="rounded-xl px-3.5 py-2.5 relative overflow-hidden transition-all duration-300"
        style={{
          borderLeft: `3.5px solid ${typeStyle.border}`,
          background: typeStyle.bg,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: `0 4px 16px rgba(0,0,0,0.3), 0 0 12px ${typeStyle.glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
          border: `1px solid rgba(255,255,255,0.06)`,
          borderLeftWidth: '3.5px',
          borderLeftColor: typeStyle.border,
        }}
      >
        {/* 顶部微光装饰 */}
        <div className="absolute top-0 left-0 right-0 h-[0.5px] bg-gradient-to-r from-transparent via-white/8 to-transparent" />
        
        {/* 类型标签 */}
        <div
          className="text-[10px] mb-1 font-semibold tracking-wide"
          style={{ color: typeStyle.border }}
        >
          {typeStyle.label}
        </div>
        {/* 文本内容 - 增加文字阴影 */}
        <p className="text-white text-[13px] leading-relaxed"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
        >
          {reaction.text}
        </p>
      </div>

      {/* 小三角指向角色 - 升级 */}
      <div
        className="absolute -right-1 bottom-4 w-2.5 h-2.5 rotate-45"
        style={{ 
          background: typeStyle.bg, 
          borderRight: `1px solid rgba(255,255,255,0.06)`, 
          borderBottom: `1px solid rgba(255,255,255,0.06)`,
          boxShadow: `2px 2px 4px rgba(0,0,0,0.2)`,
        }}
      />
    </motion.div>
  );
}
