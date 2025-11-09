import OpenAI from 'openai';
import { config, isModelSupported } from '@/config';
import { LLMResponse, GatewayRequest, Message } from '@/types';
import { logger } from '@/utils/logger';
import { GatewayError } from '@/utils/errorHandler';

// LLM 客户端服务
export class LLMClient {
  private client: OpenAI;

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

  // 转换用户请求为 OpenAI SDK 请求参数
  private transformRequest(gatewayRequest: GatewayRequest) {
    const { messages, model, temperature, max_tokens, stream, ...otherParams } = gatewayRequest;

    // 验证消息格式
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new GatewayError('messages 字段是必需的且不能为空', 400, 'INVALID_REQUEST');
    }

    // 验证消息格式
    for (const message of messages) {
      if (!message.role || !message.content) {
        throw new GatewayError('消息格式无效：必须包含 role 和 content 字段', 400, 'INVALID_MESSAGE');
      }
      if (!['system', 'user', 'assistant'].includes(message.role)) {
        throw new GatewayError('消息 role 必须是 system、user 或 assistant', 400, 'INVALID_ROLE');
      }
    }

    // 确定使用的模型
    const modelName = model || config.llm.defaultModel;

    // 验证模型是否支持
    if (!isModelSupported(modelName)) {
      throw new GatewayError(
        `不支持的模型: ${modelName}。支持的模型: ${config.llm.supportedModels.join(', ')}`,
        400,
        'UNSUPPORTED_MODEL'
      );
    }

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
  }

  // 转换 OpenAI SDK 响应为我们的响应格式
  private transformResponse(openaiResponse: OpenAI.Chat.Completions.ChatCompletion): LLMResponse {
    return {
      id: openaiResponse.id,
      object: openaiResponse.object,
      created: openaiResponse.created,
      model: openaiResponse.model,
      choices: openaiResponse.choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content || '',
        },
        finish_reason: choice.finish_reason || 'stop',
      })),
      usage: openaiResponse.usage
        ? {
            prompt_tokens: openaiResponse.usage.prompt_tokens,
            completion_tokens: openaiResponse.usage.completion_tokens,
            total_tokens: openaiResponse.usage.total_tokens,
          }
        : undefined,
    };
  }

  // 调用 LLM API
  async chat(gatewayRequest: GatewayRequest): Promise<LLMResponse> {
    try {
      const requestParams = this.transformRequest(gatewayRequest);

      // 确保非流式调用不包含 stream 参数
      const { stream, ...chatParams } = requestParams;

      logger.info('调用 LLM API', {
        model: chatParams.model,
        messageCount: chatParams.messages.length,
      });

      const startTime = Date.now();
      const openaiResponse = await this.client.chat.completions.create(chatParams);
      const duration = Date.now() - startTime;

      logger.info('LLM API 调用成功', {
        model: openaiResponse.model,
        choices: openaiResponse.choices.length,
        duration: `${duration}ms`,
        tokens: openaiResponse.usage?.total_tokens,
      });

      return this.transformResponse(openaiResponse);
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

  // 流式调用
  async chatStream(gatewayRequest: GatewayRequest): Promise<ReadableStream> {
    const requestParams = this.transformRequest({
      ...gatewayRequest,
      stream: true,
    });

    logger.info('调用 LLM API (流式)', {
      model: requestParams.model,
      messageCount: requestParams.messages.length,
    });

    try {
      const stream = await this.client.chat.completions.create({
        ...requestParams,
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
