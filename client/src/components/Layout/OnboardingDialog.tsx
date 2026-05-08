import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompanion } from '@/contexts/CompanionContext';
import { PERSONA_CONFIGS, ReactionFrequency, ReactionMode } from '@/types';

interface OnboardingDialogProps {
  open: boolean;
  onClose: () => void;
}

const FREQUENCY_OPTIONS: { value: ReactionFrequency; label: string; desc: string; emoji: string }[] = [
  { value: 'low', label: '佛系', desc: '偶尔说两句，安静陪看', emoji: '🧘' },
  { value: 'medium', label: '适中', desc: '关键时刻发表看法', emoji: '💬' },
  { value: 'high', label: '话痨', desc: '有啥说啥，热闹追剧', emoji: '🔥' },
];

const MODE_OPTIONS: { value: ReactionMode; label: string; desc: string; emoji: string }[] = [
  { value: 'danmaku', label: '纯弹幕', desc: '只显示文字弹幕', emoji: '💭' },
  { value: 'voice', label: '纯语音', desc: '只有语音播报', emoji: '🔊' },
  { value: 'both', label: '弹幕+语音', desc: '文字和语音同时呈现', emoji: '✨' },
];

export default function OnboardingDialog({ open, onClose }: OnboardingDialogProps) {
  const {
    setPersona,
    setReactionFrequency,
    setReactionMode,
    completeOnboarding,
    settings,
  } = useCompanion();
  const [step, setStep] = useState(0);

  const steps = ['选择角色', '选择频率', '呈现方式', '开始陪看'];

  const handleComplete = () => {
    completeOnboarding();
    onClose();
  };

  /** 用户点击关闭按钮 - 标记已引导但不自动开启 */
  const handleDismiss = () => {
    completeOnboarding();
    onClose();
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  if (!open) return null;

  const selectedPersona = PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0];

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60]"
            onClick={handleDismiss}
          />
          {/* 弹窗 */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 280 }}
            className="fixed inset-0 z-[61] w-[420px] max-w-[90vw] max-h-[90vh] m-auto rounded-2xl overflow-hidden shadow-2xl"
            style={{
              height: 'fit-content',
              background: 'linear-gradient(180deg, rgba(26,26,42,0.97) 0%, rgba(13,13,24,0.99) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 40px rgba(22,119,255,0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
              {/* 顶部光效装饰 */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-txv-blue-light/40 to-transparent" />

              {/* 头部 */}
              <div className="relative h-16 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-txv-blue/15 to-txv-orange/15" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-transparent via-white/[0.02]" />
                <h2 className="text-white font-semibold text-base relative z-10">✨ 开启AI陪看</h2>
                <button
                  onClick={handleDismiss}
                  className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/50 hover:text-white text-sm transition-all"
                >
                  ✕
                </button>
              </div>

              {/* 步骤指示 */}
              <div className="flex items-center justify-center gap-2 py-3">
                {steps.map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      width: i === step ? 24 : 8,
                      backgroundColor: i === step ? '#1677FF' : i < step ? 'rgba(22,119,255,0.5)' : 'rgba(255,255,255,0.1)',
                    }}
                    className="h-2 rounded-full transition-all"
                  />
                ))}
              </div>

              {/* 步骤内容 */}
              <div className="px-6 pb-4" style={{ minHeight: 300 }}>
                <AnimatePresence mode="wait">
                  {/* Step 0: 选择角色 */}
                  {step === 0 && (
                    <motion.div
                      key="step-0"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ type: 'spring', damping: 22 }}
                    >
                      <p className="text-txv-text-secondary text-sm text-center mb-4">选个搭子一起追剧吧</p>
                      <div className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-hide">
                        {PERSONA_CONFIGS.map(persona => (
                          <motion.button
                            key={persona.type}
                            onClick={() => setPersona(persona.type)}
                            whileHover={{ scale: 1.01, y: -1 }}
                            whileTap={{ scale: 0.99 }}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 ${
                              settings.persona === persona.type
                                ? 'bg-white/[0.08] border'
                                : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.05]'
                            }`}
                            style={settings.persona === persona.type ? { 
                              borderColor: `${persona.color}40`,
                              boxShadow: `0 0 16px ${persona.color}15`,
                            } : {}}
                          >
                            <div
                              className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 transition-all"
                              style={{
                                ringColor: settings.persona === persona.type ? persona.color : 'rgba(255,255,255,0.1)',
                                boxShadow: settings.persona === persona.type ? `0 0 16px ${persona.color}40` : 'none',
                              }}
                            >
                              <img src={persona.avatarUrl} alt={persona.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white">{persona.name}</div>
                              <div className="text-xs text-txv-text-tertiary">{persona.description}</div>
                            </div>
                            {settings.persona === persona.type && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-5 h-5 rounded-full bg-gradient-to-r from-txv-blue to-txv-blue-light flex items-center justify-center flex-shrink-0"
                              >
                                <span className="text-white text-[10px]">✓</span>
                              </motion.div>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 1: 选择频率 */}
                  {step === 1 && (
                    <motion.div
                      key="step-1"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ type: 'spring', damping: 22 }}
                    >
                      <p className="text-txv-text-secondary text-sm text-center mb-4">TA 说话的频率你来定</p>
                      <div className="space-y-3">
                        {FREQUENCY_OPTIONS.map(option => (
                          <motion.button
                            key={option.value}
                            onClick={() => setReactionFrequency(option.value)}
                            whileHover={{ scale: 1.01, y: -1 }}
                            whileTap={{ scale: 0.99 }}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all duration-200 ${
                              settings.reactionFrequency === option.value
                                ? 'bg-white/[0.08] border border-txv-blue/40'
                                : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.05]'
                            }`}
                            style={settings.reactionFrequency === option.value ? {
                              boxShadow: '0 0 16px rgba(22,119,255,0.15)',
                            } : {}}
                          >
                            <div className="text-2xl flex-shrink-0">{option.emoji}</div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-white">{option.label}</div>
                              <div className="text-xs text-txv-text-tertiary mt-0.5">{option.desc}</div>
                            </div>
                            {settings.reactionFrequency === option.value && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-5 h-5 rounded-full bg-gradient-to-r from-txv-blue to-txv-blue-light flex items-center justify-center flex-shrink-0"
                              >
                                <span className="text-white text-[10px]">✓</span>
                              </motion.div>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: 选择呈现方式 */}
                  {step === 2 && (
                    <motion.div
                      key="step-2"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ type: 'spring', damping: 22 }}
                    >
                      <p className="text-txv-text-secondary text-sm text-center mb-4">选择 AI 反应的呈现方式</p>
                      <div className="space-y-3">
                        {MODE_OPTIONS.map(option => (
                          <motion.button
                            key={option.value}
                            onClick={() => setReactionMode(option.value)}
                            whileHover={{ scale: 1.01, y: -1 }}
                            whileTap={{ scale: 0.99 }}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all duration-200 ${
                              settings.reactionMode === option.value
                                ? 'bg-white/[0.08] border border-txv-orange/40'
                                : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.05]'
                            }`}
                            style={settings.reactionMode === option.value ? {
                              boxShadow: '0 0 16px rgba(255,106,0,0.15)',
                            } : {}}
                          >
                            <div className="text-2xl flex-shrink-0">{option.emoji}</div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-white">{option.label}</div>
                              <div className="text-xs text-txv-text-tertiary mt-0.5">{option.desc}</div>
                            </div>
                            {settings.reactionMode === option.value && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-5 h-5 rounded-full bg-gradient-to-r from-txv-orange to-txv-orange-light flex items-center justify-center flex-shrink-0"
                              >
                                <span className="text-white text-[10px]">✓</span>
                              </motion.div>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: 确认 */}
                  {step === 3 && (
                    <motion.div
                      key="step-3"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ type: 'spring', damping: 22 }}
                      className="text-center"
                    >
                      <p className="text-txv-text-secondary text-sm mb-6">一切就绪！准备开始陪看之旅</p>
                      <div className="flex flex-col items-center gap-4">
                        <motion.div
                          className="w-24 h-24 rounded-full overflow-hidden ring-3"
                          style={{ 
                            boxShadow: `0 0 32px ${selectedPersona.color}40`,
                            ringColor: `${selectedPersona.color}60`,
                          }}
                          animate={{
                            y: [0, -6, 0],
                            scale: [1, 1.02, 1],
                          }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <img
                            src={selectedPersona.avatarUrl}
                            alt={selectedPersona.name}
                            className="w-full h-full object-cover"
                          />
                        </motion.div>
                        <div>
                          <div className="text-white font-medium text-lg">
                            {selectedPersona.name}
                          </div>
                          <div className="text-txv-text-tertiary text-xs mt-1">
                            {selectedPersona.description}
                          </div>
                          {/* 用户选择摘要 */}
                          <div className="flex gap-2 mt-3 justify-center flex-wrap">
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full border bg-txv-blue/10 text-txv-blue-light border-txv-blue/25">
                              频率: {FREQUENCY_OPTIONS.find(f => f.value === settings.reactionFrequency)?.label}
                            </span>
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full border bg-txv-orange/10 text-txv-orange-light border-txv-orange/25">
                              呈现: {MODE_OPTIONS.find(m => m.value === settings.reactionMode)?.label}
                            </span>
                          </div>
                          <div className="flex gap-1.5 mt-3 justify-center flex-wrap">
                            {selectedPersona.skills.map(skill => (
                              <span
                                key={skill}
                                className="text-[10px] px-2.5 py-0.5 rounded-full border"
                                style={{
                                  background: `${selectedPersona.color}10`,
                                  color: selectedPersona.color,
                                  borderColor: `${selectedPersona.color}25`,
                                }}
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 底部按钮 */}
              <div className="px-6 pb-5 flex gap-3">
                {step > 0 && (
                  <button
                    onClick={() => setStep(step - 1)}
                    className="flex-1 py-3 rounded-xl text-txv-text-secondary bg-white/[0.04] hover:bg-white/[0.08] text-sm font-medium transition-all border border-white/[0.06] hover:border-white/10"
                  >
                    上一步
                  </button>
                )}
                <motion.button
                  onClick={handleNext}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-3 rounded-xl text-white font-medium text-sm bg-gradient-to-r from-txv-blue to-txv-blue-light hover:shadow-lg hover:shadow-txv-blue/25 transition-all relative overflow-hidden"
                >
                  {step < 3 ? '下一步' : '🎬 开始陪看'}
                  {/* 流光扫过效果 */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                  />
                </motion.button>
              </div>
            </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
