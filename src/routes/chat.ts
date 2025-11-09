import { Router, Request, Response } from 'express';
import { llmClient } from '../services/llmClient';
import { GatewayRequest } from '../types';
import { handleApiError } from '../utils/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/chat - 处理聊天请求
// 注意：验签已在 server.ts 中全局应用
router.post('/', async (req: Request, res: Response) => {
  try {
    const body: GatewayRequest = req.body;

    logger.info('收到用户请求', {
      hasMessages: !!body.messages,
      messageCount: body.messages?.length || 0,
      model: body.model,
    });

    // 调用 LLM 服务
    const response = await llmClient.chat(body);

    // 返回响应
    res.json(response);
  } catch (error) {
    logger.error('处理聊天请求时出错', error);
    const { statusCode, response: errorResponse } = handleApiError(error);
    res.status(statusCode).json(errorResponse);
  }
});

// GET /api/chat - 健康检查
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'LLM Gateway API 运行正常',
    timestamp: new Date().toISOString(),
  });
});

export default router;

