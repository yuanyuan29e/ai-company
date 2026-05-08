import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '@/types';
import { streamChat } from '@/services/api';
import { useCompanion } from '@/contexts/CompanionContext';

/**
 * 对话 Hook
 * 管理聊天消息列表、发送消息和流式接收
 * 升级：支持视觉增强对话（自动附带当前视频帧）
 */
export function useChat() {
  const { settings, playerState, latestFrame } = useCompanion();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messageIdCounter = useRef(0);

  // AI回复字数上限（口语化弹幕风格，不需要长回复）
  const MAX_REPLY_LENGTH = 50;

  /** 发送消息 */
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isSending) return;

    const userMsgId = `msg-${++messageIdCounter.current}`;
    const assistantMsgId = `msg-${++messageIdCounter.current}`;

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    // 添加 AI 消息占位
    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsSending(true);

    // 构建对话历史（最近 10 条）
    const history = messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // 用于追踪当前回复长度
    let currentLength = 0;
    let truncated = false;

    // 流式对话（AI陪看启用时自动附带当前视频帧，实现视觉增强对话）
    await streamChat(
      {
        message: text.trim(),
        persona: settings.persona,
        episodeId: 'episode-01',
        currentTime: playerState.currentTime,
        history,
        // 视觉增强：如果有最新帧且AI陪看已开启，附带视频帧
        currentFrame: settings.enabled && latestFrame ? latestFrame : undefined,
      },
      // onChunk: 逐字更新 AI 消息（超过上限则截断）
      (chunk) => {
        if (truncated) return;
        currentLength += chunk.length;
        if (currentLength > MAX_REPLY_LENGTH) {
          truncated = true;
          // 截取不超限的部分
          const overflowChars = currentLength - MAX_REPLY_LENGTH;
          const validPart = chunk.slice(0, chunk.length - overflowChars);
          if (validPart) {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + validPart }
                  : m
              )
            );
          }
          // 自动标记完成
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, isStreaming: false }
                : m
            )
          );
          setIsSending(false);
          return;
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: m.content + chunk }
              : m
          )
        );
      },
      // onDone: 标记完成
      () => {
        if (truncated) return;
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, isStreaming: false }
              : m
          )
        );
        setIsSending(false);
      },
      // onError: 显示错误
      (error) => {
        if (truncated) return;
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: `❌ ${error}`, isStreaming: false }
              : m
          )
        );
        setIsSending(false);
      }
    );
  }, [isSending, messages, settings.persona, settings.enabled, playerState.currentTime, latestFrame]);

  /** 清空聊天记录 */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isSending,
    sendMessage,
    clearMessages,
  };
}
