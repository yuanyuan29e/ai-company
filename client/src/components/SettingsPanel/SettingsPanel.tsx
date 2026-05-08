import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompanion } from '@/contexts/CompanionContext';
import {
  PERSONA_CONFIGS,
  ReactionFrequency,
  ReactionMode,
} from '@/types';
import PersonaCard from './PersonaCard';

export default function SettingsPanel() {
  const {
    showSettings,
    toggleSettings,
    settings,
    setPersona,
    setReactionFrequency,
    setReactionMode,
  } = useCompanion();

  const frequencyOptions: { value: ReactionFrequency; label: string; desc: string }[] = [
    { value: 'high', label: '高频', desc: '不放过任何精彩节点' },
    { value: 'medium', label: '中频', desc: '适度互动不打扰' },
    { value: 'low', label: '低频', desc: '只在关键时刻出现' },
  ];

  const modeOptions: { value: ReactionMode; label: string; icon: string }[] = [
    { value: 'danmaku', label: '仅弹幕', icon: '💬' },
    { value: 'voice', label: '仅语音', icon: '🔊' },
    { value: 'both', label: '语音+弹幕', icon: '🎤' },
  ];

  return (
    <AnimatePresence>
      {showSettings && (
        <>
          {/* 遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleSettings}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* 设置面板 */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-80 z-50 glass-panel overflow-y-auto scrollbar-hide"
          >
            {/* 顶部渐变装饰 */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-txv-blue-light/30 to-transparent" />

            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-white font-semibold text-base flex items-center gap-2">
                <span className="text-txv-orange">⚙</span>
                剧搭子设置
              </h2>
              <button
                onClick={toggleSettings}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-txv-text-secondary hover:text-white transition-all"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-6">
              {/* AI角色选择 */}
              <section>
                <h3 className="text-txv-text-secondary text-xs font-medium mb-3 uppercase tracking-wider">选个搭子一起追剧吧</h3>
                <div className="space-y-2">
                  {PERSONA_CONFIGS.map(persona => (
                    <PersonaCard
                      key={persona.type}
                      config={persona}
                      isSelected={settings.persona === persona.type}
                      onClick={() => setPersona(persona.type)}
                    />
                  ))}
                </div>
              </section>

              {/* Reaction 频率 */}
              <section>
                <h3 className="text-txv-text-secondary text-xs font-medium mb-3 uppercase tracking-wider">Reaction 频率</h3>
                <div className="space-y-1.5">
                  {frequencyOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setReactionFrequency(opt.value)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-200 ${
                        settings.reactionFrequency === opt.value
                          ? 'bg-txv-blue/10 text-white border border-txv-blue/20 shadow-[0_0_12px_rgba(22,119,255,0.1)]'
                          : 'text-txv-text-secondary hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="text-xs text-txv-text-tertiary">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* 呈现形式 */}
              <section>
                <h3 className="text-txv-text-secondary text-xs font-medium mb-3 uppercase tracking-wider">呈现形式</h3>
                <div className="flex gap-2">
                  {modeOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setReactionMode(opt.value)}
                      className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl transition-all duration-200 ${
                        settings.reactionMode === opt.value
                          ? 'bg-txv-blue/10 border border-txv-blue/30 text-white shadow-[0_0_16px_rgba(22,119,255,0.1)]'
                          : 'bg-white/[0.03] border border-white/[0.06] text-txv-text-secondary hover:bg-white/[0.06] hover:border-white/10'
                      }`}
                    >
                      <span className="text-lg">{opt.icon}</span>
                      <span className="text-xs">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* 底部保存按钮 */}
            <div className="px-5 py-4 border-t border-white/[0.06]">
              <motion.button
                onClick={toggleSettings}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3 rounded-xl font-medium text-white bg-gradient-to-r from-txv-blue to-txv-blue-light hover:shadow-lg hover:shadow-txv-blue/25 transition-all relative overflow-hidden light-sweep"
              >
                完成设置
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
