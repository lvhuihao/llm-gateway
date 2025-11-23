import { GatewayRequest, Message } from '@/types';
import { config, isModelSupported } from '@/config';
import { GatewayError } from '@/utils/errorHandler';

/**
 * 验证消息格式
 * @param messages 消息数组
 * @throws GatewayError 如果消息格式无效
 */
const validateMessages = (messages: Message[]): void => {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new GatewayError('messages 字段是必需的且不能为空', 400, 'INVALID_REQUEST');
  }

  for (const message of messages) {
    if (!message.role) {
      throw new GatewayError('消息格式无效：必须包含 role 字段', 400, 'INVALID_MESSAGE');
    }
    // tool 角色的消息可能没有 content，但有 tool_call_id
    if (message.role !== 'tool' && !message.content) {
      throw new GatewayError('消息格式无效：必须包含 content 字段', 400, 'INVALID_MESSAGE');
    }
    if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
      throw new GatewayError('消息 role 必须是 system、user、assistant 或 tool', 400, 'INVALID_ROLE');
    }
  }
};

/**
 * 验证模型是否支持
 * @param modelName 模型名称
 * @throws GatewayError 如果模型不支持
 */
const validateModel = (modelName: string): void => {
  if (!isModelSupported(modelName)) {
    throw new GatewayError(
      `不支持的模型: ${modelName}。支持的模型: ${config.llm.supportedModels.join(', ')}`,
      400,
      'UNSUPPORTED_MODEL'
    );
  }
};

/**
 * 转换用户请求为 OpenAI SDK 请求参数
 * @param gatewayRequest 网关请求对象
 * @returns OpenAI SDK 请求参数
 */
export const transformRequest = (gatewayRequest: GatewayRequest) => {
  const { messages, model, temperature, max_tokens, stream, ...otherParams } = gatewayRequest;

  // 验证消息格式
  validateMessages(messages);

  // 确定使用的模型
  const modelName = model || config.llm.defaultModel;

  // 验证模型是否支持
  validateModel(modelName);

  // 构建请求参数，使用默认参数填充缺失的字段
  return {
    model: modelName,
    messages: messages as Message[],
    temperature: temperature !== undefined ? temperature : config.llm.defaultParams.temperature,
    max_tokens: max_tokens !== undefined ? max_tokens : config.llm.defaultParams.maxTokens,
    top_p: config.llm.defaultParams.topP,
    frequency_penalty: config.llm.defaultParams.frequencyPenalty,
    presence_penalty: config.llm.defaultParams.presencePenalty,
    ...(stream !== undefined && { stream }),
    ...otherParams,
  };
};

