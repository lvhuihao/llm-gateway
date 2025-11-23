import { randomUUID } from 'crypto';
import { AnalyzeRequest, Message } from '@/types';
import { ANALYZE_SYSTEM_PROMPT } from '@/prompts/analyze';

/**
 * 生成会话ID
 * @returns 新的会话ID
 */
export const generateSessionId = (): string => {
  return randomUUID();
};

/**
 * 构建分析请求的用户提示词
 * @param requestData 分析请求数据
 * @returns 用户提示词字符串
 */
export const buildAnalyzeUserPrompt = (requestData: AnalyzeRequest): string => {
  return `## 任务描述
${requestData.task || '提取当前页面中的数据'}
## 页面信息
- **URL**: ${requestData.url || '未提供'}
- **页面标题**: ${requestData.title || '未提供'}
- **内容类型**: ${requestData.html ? 'HTML源码' : 'A11y无障碍树'}

## 页面内容
${requestData.html ? requestData.html : requestData.axTree}
---
`;
};

/**
 * 构建分析请求的完整消息列表
 * @param requestData 分析请求数据
 * @param historyMessages 历史消息列表
 * @returns 完整的消息列表
 */
export const buildAnalyzeMessages = (
  requestData: AnalyzeRequest,
  historyMessages: Message[]
): Message[] => {
  const isFirstConversation = historyMessages.length === 0;
  const userPrompt = buildAnalyzeUserPrompt(requestData);
  const currentUserMessage: Message = {
    role: 'user',
    content: userPrompt,
  };

  if (isFirstConversation) {
    // 第一次对话：系统消息 + 用户消息
    return [
      {
        role: 'system',
        content: ANALYZE_SYSTEM_PROMPT,
      },
      currentUserMessage,
    ];
  }

  // 非第一次对话：历史消息（已包含系统消息）+ 当前用户消息
  return [...historyMessages, currentUserMessage];
};

/**
 * 构建需要保存的消息列表（用于分析请求）
 * @param requestData 分析请求数据
 * @param historyMessages 历史消息列表
 * @param assistantMessage 助手回复消息
 * @returns 需要保存的消息列表
 */
export const buildMessagesToSaveForAnalyze = (
  requestData: AnalyzeRequest,
  historyMessages: Message[],
  assistantMessage: Message
): Message[] => {
  const isFirstConversation = historyMessages.length === 0;
  const userPrompt = buildAnalyzeUserPrompt(requestData);
  const currentUserMessage: Message = {
    role: 'user',
    content: userPrompt,
  };

  const messagesToSave: Message[] = [];

  // 如果是第一次对话，保存系统消息
  if (isFirstConversation) {
    messagesToSave.push({
      role: 'system',
      content: ANALYZE_SYSTEM_PROMPT,
    });
  }

  // 保存用户消息和助手回复
  messagesToSave.push(currentUserMessage);
  messagesToSave.push(assistantMessage);

  return messagesToSave;
};

