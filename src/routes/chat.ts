import { Router, Request, Response } from 'express';
import { llmClient } from '../services/llmClient';
import { messageStore } from '../services/messageStore';
import { GatewayRequest, Message } from '../types';
import { handleApiError } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { validateChatRequest } from '../utils/requestValidators';
import { generateSessionId } from '../utils/messageBuilders';

const router = Router();

/**
 * POST /api/chat - 处理聊天请求
 * 注意：验签已在 server.ts 中全局应用
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body: GatewayRequest = req.body;

    // 验证必需参数
    const validationError = validateChatRequest(body);
    if (validationError) {
      return res.status(400).json({
        error: validationError,
      });
    }

    // 获取或生成 sessionId
    const sessionId = body.sessionId || generateSessionId();

    // 获取历史消息
    const historyMessages = messageStore.getSessionMessages(sessionId);

    // 合并历史消息和当前消息
    const currentMessages = body.messages;
    const allMessages = [...historyMessages, ...currentMessages];

    logger.info('处理聊天请求', {
      sessionId,
      historyMessageCount: historyMessages.length,
      currentMessageCount: currentMessages.length,
      totalMessageCount: allMessages.length,
      model: body.model,
    });

    // 构建请求对象（使用合并后的消息）
    const requestWithHistory: GatewayRequest = {
      ...body,
      messages: allMessages,
    };

    // 调用 LLM 服务
    const response = await llmClient.chat(requestWithHistory);

    // 提取助手回复
    const assistantMessage: Message | undefined = response.choices[0]?.message;

    if (assistantMessage) {
      // 保存当前请求的消息到历史
      const messagesToSave: Message[] = [...currentMessages];
      // 保存助手回复
      messagesToSave.push(assistantMessage);

      // 批量保存消息
      if (messagesToSave.length > 0) {
        messageStore.addMessages(sessionId, messagesToSave);
      }

      logger.info('消息已保存到历史', {
        sessionId,
        savedMessages: messagesToSave.length,
      });
    }

    // 返回响应，包含 sessionId
    res.json({
      ...response,
      sessionId, // 在响应中包含 sessionId，方便客户端后续使用
    });
  } catch (error) {
    logger.error('处理聊天请求时出错', error);
    const { statusCode, response: errorResponse } = handleApiError(error);
    res.status(statusCode).json(errorResponse);
  }
});

/**
 * GET /api/chat - 健康检查
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'LLM Gateway API 运行正常',
    timestamp: new Date().toISOString(),
  });
});

export default router;

