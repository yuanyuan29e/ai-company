import React from 'react';
import { motion } from 'framer-motion';
import { ChatMessage as ChatMessageType } from '@/types';
import { useCompanion } from '@/contexts/CompanionContext';
import { PERSONA_CONFIGS } from '@/types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessageItem({ message }: ChatMessageProps) {
  const { settings } = useCompanion();
  const isUser = message.role === 'user';
  const personaConfig = PERSONA_CONFIGS.find(p => p.type === settings.persona) || PERSONA_CONFIGS[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-3`}
    >
      {/* 头像 */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-txv-surface">
          <img src={personaConfig.avatarUrl} alt={personaConfig.name} className="w-full h-full object-cover" />
        </div>
      )}

      {/* 消息气泡 */}
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* AI 角色名 */}
        {!isUser && personaConfig && (
          <div className="text-[10px] text-txv-text-tertiary mb-1 ml-1">
            {personaConfig.name}
          </div>
        )}

        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-txv-blue text-white rounded-tr-sm'
              : 'bg-txv-surface text-txv-text rounded-tl-sm'
          }`}
        >
          {message.content}
          {/* 流式打字光标 */}
          {message.isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-txv-blue-light ml-0.5 animate-pulse" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
