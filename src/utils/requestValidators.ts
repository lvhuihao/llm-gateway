import { AnalyzeRequest, GatewayRequest } from '@/types';

/**
 * 验证分析请求参数
 * @param requestData 分析请求数据
 * @returns 验证错误消息，如果验证通过则返回 null
 */
export const validateAnalyzeRequest = (
  requestData: AnalyzeRequest
): { message: string; type: string } | null => {
  if (!requestData.html && !requestData.axTree) {
    return {
      message: 'html/axTree 字段是必需的',
      type: 'INVALID_REQUEST',
    };
  }
  return null;
};

/**
 * 验证聊天请求参数
 * @param body 聊天请求数据
 * @returns 验证错误消息，如果验证通过则返回 null
 */
export const validateChatRequest = (
  body: GatewayRequest
): { message: string; type: string } | null => {
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return {
      message: 'messages 字段是必需的且不能为空',
      type: 'INVALID_REQUEST',
    };
  }
  return null;
};

