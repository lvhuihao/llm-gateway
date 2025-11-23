import OpenAI from 'openai';
import { config } from '@/config';
import { LLMResponse, GatewayRequest } from '@/types';
import { logger } from '@/utils/logger';
import { GatewayError } from '@/utils/errorHandler';
import { transformRequest } from './transformers/requestTransformer';
import { transformResponse } from './transformers/responseTransformer';
import { convertMessagesToOpenAI } from './transformers/messageConverter';

/**
 * LLM 客户端服务
 * 负责与 OpenAI 兼容的 LLM API 进行交互
 */
export class LLMClient {
  private client: OpenAI;

  /**
   * 初始化 LLM 客户端
   */
  constructor() {
    this.client = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
      timeout: 60000, // 60秒超时
      maxRetries: 2, // 最大重试次数
    });

    logger.info('OpenAI SDK 客户端已初始化', {
      baseURL: config.llm.baseUrl,
      defaultModel: config.llm.defaultModel,
    });
  }

  /**
   * 调用 LLM API（非流式）
   * @param gatewayRequest 网关请求对象
   * @returns LLM 响应对象
   */
  async chat(gatewayRequest: GatewayRequest): Promise<LLMResponse> {
    try {
      const requestParams = transformRequest(gatewayRequest);

      // 确保非流式调用不包含 stream 参数
      const { stream, sessionId, ...chatParams } = requestParams;

      // 转换消息格式以兼容 OpenAI SDK
      const openaiMessages = convertMessagesToOpenAI(chatParams.messages);

      logger.info('调用 LLM API', {
        model: chatParams.model,
        messageCount: openaiMessages.length,
      });

      const startTime = Date.now();
      const openaiResponse = await this.client.chat.completions.create({
        ...chatParams,
        messages: openaiMessages,
      });
      const duration = Date.now() - startTime;

      logger.info('LLM API 调用成功', {
        model: openaiResponse.model,
        choices: openaiResponse.choices.length,
        duration: `${duration}ms`,
        tokens: openaiResponse.usage?.total_tokens,
      });

      return transformResponse(openaiResponse);
    } catch (error) {
      logger.error('LLM API 调用失败', error);

      // 处理 OpenAI SDK 的错误
      if (error instanceof OpenAI.APIError) {
        throw new GatewayError(
          error.message || 'LLM API 调用失败',
          error.status || 500,
          error.code || 'API_ERROR'
        );
      }

      throw error;
    }
  }

  /**
   * 流式调用 LLM API
   * @param gatewayRequest 网关请求对象
   * @returns ReadableStream 流对象
   */
  async chatStream(gatewayRequest: GatewayRequest): Promise<ReadableStream> {
    const requestParams = transformRequest({
      ...gatewayRequest,
      stream: true,
    });

    // 确保非流式调用不包含 stream 参数
    const { stream, sessionId, ...chatParams } = requestParams;

    // 转换消息格式以兼容 OpenAI SDK
    const openaiMessages = convertMessagesToOpenAI(chatParams.messages);

    logger.info('调用 LLM API (流式)', {
      model: chatParams.model,
      messageCount: openaiMessages.length,
    });

    try {
      const stream = await this.client.chat.completions.create({
        ...chatParams,
        messages: openaiMessages,
        stream: true,
      });

      // 将 OpenAI 的流转换为 ReadableStream
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const data = JSON.stringify(chunk) + '\n';
              controller.enqueue(encoder.encode(data));
            }
            controller.close();
          } catch (error) {
            logger.error('流式响应处理失败', error);
            controller.error(error);
          }
        },
      });

      return readableStream;
    } catch (error) {
      logger.error('流式 API 调用失败', error);

      if (error instanceof OpenAI.APIError) {
        throw new GatewayError(
          error.message || '流式 LLM API 调用失败',
          error.status || 500,
          error.code || 'API_ERROR'
        );
      }

      throw error;
    }
  }
}

// 导出单例
export const llmClient = new LLMClient();
