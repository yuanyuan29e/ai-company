import React from 'react';
import { motion } from 'framer-motion';
import { PersonaConfig } from '@/types';

interface PersonaCardProps {
  config: PersonaConfig;
  isSelected: boolean;
  onClick: () => void;
}

export default function PersonaCard({ config, isSelected, onClick }: PersonaCardProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left rounded-xl p-3 transition-all ${
        isSelected
          ? 'bg-gradient-to-r from-white/10 to-white/5 border border-white/20'
          : 'bg-white/5 border border-transparent hover:bg-white/8'
      }`}
      style={isSelected ? { borderColor: config.color + '60' } : {}}
    >
      <div className="flex items-center gap-3">
        {/* 角色头像 */}
        <div
          className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 ring-2"
          style={{
            ringColor: isSelected ? config.color : 'transparent',
            boxShadow: isSelected ? `0 0 12px ${config.color}40` : 'none',
          }}
        >
          <img
            src={config.avatarUrl}
            alt={config.name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-txv-text-secondary'}`}>
              {config.name}
            </span>
            {isSelected && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white"
                style={{ background: config.color }}
              >
                ✓
              </motion.span>
            )}
          </div>
          <p className="text-xs text-txv-text-tertiary mt-0.5 truncate">{config.description}</p>
          {/* 技能标签 */}
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {config.skills.map(skill => (
              <span
                key={skill}
                className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{
                  background: isSelected ? `${config.color}15` : 'rgba(255,255,255,0.05)',
                  color: isSelected ? config.color : 'rgba(255,255,255,0.4)',
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
