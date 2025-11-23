import OpenAI from 'openai';
import { LLMResponse, Message } from '@/types';

/**
 * 转换工具调用格式
 * @param toolCalls OpenAI SDK 的工具调用数组
 * @returns 转换后的工具调用数组
 */
const transformToolCalls = (
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessage['tool_calls']
): Message['tool_calls'] => {
  if (!toolCalls) {
    return undefined;
  }

  const transformed: Message['tool_calls'] = [];
  for (const tc of toolCalls) {
    if (tc.type === 'function' && 'function' in tc) {
      transformed.push({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: (tc as { function: { name: string; arguments: string } }).function.name,
          arguments: (tc as { function: { name: string; arguments: string } }).function.arguments,
        },
      });
    }
  }
  return transformed.length > 0 ? transformed : undefined;
};

/**
 * 转换选择项
 * @param choice OpenAI SDK 的选择项
 * @returns 转换后的选择项
 */
const transformChoice = (
  choice: OpenAI.Chat.Completions.ChatCompletion.Choice
): LLMResponse['choices'][0] => {
  const message: Message = {
    role: choice.message.role,
    content: choice.message.content || '',
  };

  // 处理 tool_calls（只处理 function 类型的 tool calls）
  const toolCalls = transformToolCalls(choice.message.tool_calls);
  if (toolCalls) {
    message.tool_calls = toolCalls;
  }

  return {
    index: choice.index,
    message,
    finish_reason: choice.finish_reason || 'stop',
  };
};

/**
 * 转换使用情况统计
 * @param usage OpenAI SDK 的使用情况统计
 * @returns 转换后的使用情况统计
 */
const transformUsage = (
  usage: OpenAI.Completions.CompletionUsage | null | undefined
): LLMResponse['usage'] => {
  if (!usage) {
    return undefined;
  }

  return {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
  };
};

/**
 * 转换 OpenAI SDK 响应为我们的响应格式
 * @param openaiResponse OpenAI SDK 的响应对象
 * @returns 转换后的响应对象
 */
export const transformResponse = (
  openaiResponse: OpenAI.Chat.Completions.ChatCompletion
): LLMResponse => {
  return {
    id: openaiResponse.id,
    object: openaiResponse.object,
    created: openaiResponse.created,
    model: openaiResponse.model,
    choices: openaiResponse.choices.map(transformChoice),
    usage: transformUsage(openaiResponse.usage),
  };
};

