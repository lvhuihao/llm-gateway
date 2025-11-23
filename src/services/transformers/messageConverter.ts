import OpenAI from 'openai';
import { Message } from '@/types';

/**
 * 转换消息格式以兼容 OpenAI SDK
 * @param msg 消息对象
 * @returns OpenAI SDK 兼容的消息格式
 */
export const convertMessageToOpenAI = (
  msg: Message
): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
  // 处理 tool 角色的消息
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      content: msg.content,
      tool_call_id: msg.tool_call_id!,
    };
  }

  // 处理 assistant 角色的消息（可能包含 tool_calls）
  if (msg.role === 'assistant' && msg.tool_calls) {
    return {
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    };
  }

  // 处理普通消息（system、user、assistant）
  return {
    role: msg.role,
    content: msg.content,
  } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
};

/**
 * 批量转换消息格式
 * @param messages 消息数组
 * @returns OpenAI SDK 兼容的消息数组
 */
export const convertMessagesToOpenAI = (
  messages: Message[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => {
  return messages.map(convertMessageToOpenAI);
};

