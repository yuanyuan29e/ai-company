import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompanion } from '@/contexts/CompanionContext';
import { useChat } from '@/hooks/useChat';
import { PERSONA_CONFIGS } from '@/types';
import { quickQuestions } from '@/data/sampleNodes';
import ChatMessageItem from './ChatMessage';

export default function ChatPanel() {
  const { showChat, setShowChat, settings } = useCompanion();
  const { messages, isSending, sendMessage } = useChat();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const personaConfig = PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0];

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || isSending) return;
    sendMessage(inputText);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickQuestion = (q: string) => {
    if (isSending) return;
    sendMessage(q);
  };

  return (
    <>
      {/* 触发按钮 - "和TA聊聊" */}
      {settings.enabled && !showChat && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setShowChat(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-txv-blue to-txv-blue-light text-white px-5 py-2.5 rounded-full text-sm font-medium shadow-lg shadow-txv-blue/30 flex items-center gap-2 transition-all hover:shadow-xl hover:shadow-txv-blue/40 hover:-translate-y-0.5"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
          </svg>
          <span>和{personaConfig?.name || 'TA'}聊聊</span>
        </motion.button>
      )}

      {/* 聊天面板 */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl glass-panel"
            style={{ height: '45vh', maxHeight: '400px' }}
          >
            {/* 顶部渐变装饰线 */}
            <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl bg-gradient-to-r from-txv-orange via-txv-blue to-txv-blue-light opacity-60" />

            {/* 面板头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                {personaConfig?.avatarUrl ? (
                  <img src={personaConfig.avatarUrl} alt={personaConfig.name} className="w-6 h-6 rounded-full ring-1 ring-white/10" />
                ) : (
                  <span className="text-base">💬</span>
                )}
                <span className="text-white font-medium text-sm">{personaConfig?.name || 'AI助手'}</span>
                <span className="text-txv-text-tertiary text-xs px-2 py-0.5 bg-white/5 rounded-full border border-white/[0.06] flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
                  陪看中
                </span>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="text-txv-text-tertiary hover:text-white transition-colors p-1 hover:bg-white/5 rounded-full"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                </svg>
              </button>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-hide" style={{ height: 'calc(100% - 130px)' }}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-txv-text-tertiary">
                  {personaConfig?.avatarUrl ? (
                    <img src={personaConfig.avatarUrl} alt={personaConfig.name} className="w-12 h-12 rounded-full mb-3 ring-2 ring-white/5 animate-float" />
                  ) : (
                    <span className="text-3xl mb-3">💬</span>
                  )}
                  <p className="text-sm">有什么想聊的？问问{personaConfig?.name || 'AI'}吧～</p>
                </div>
              ) : (
                messages.map(msg => (
                  <ChatMessageItem key={msg.id} message={msg} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 快捷提问 */}
            {messages.length === 0 && (
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
                {quickQuestions.slice(0, 4).map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickQuestion(q)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full border border-white/[0.08] text-txv-text-secondary text-xs hover:bg-white/5 hover:border-white/15 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* 输入区域 */}
            <div className="absolute bottom-0 left-0 right-0 px-4 py-3 border-t border-white/[0.06]"
              style={{ background: 'linear-gradient(to top, rgba(14,14,26,0.98), rgba(14,14,26,0.9))' }}
            >
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`和${personaConfig?.name || 'AI'}聊聊当前剧情...`}
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-2.5 text-sm text-white placeholder-txv-text-tertiary outline-none focus:border-txv-blue/50 focus:shadow-[0_0_12px_rgba(22,119,255,0.15)] transition-all"
                  disabled={isSending}
                />
                <motion.button
                  onClick={handleSend}
                  disabled={!inputText.trim() || isSending}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    inputText.trim() && !isSending
                      ? 'bg-gradient-to-r from-txv-blue to-txv-blue-light text-white shadow-glow-sm'
                      : 'bg-white/[0.04] text-txv-text-tertiary border border-white/[0.06]'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
