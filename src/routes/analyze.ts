import { Router, Request, Response } from 'express';
import { llmClient } from '../services/llmClient';
import { messageStore } from '../services/messageStore';
import { AnalyzeRequest } from '../types';
import { handleApiError } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { config } from '../config';
import { validateAnalyzeRequest } from '../utils/requestValidators';
import {
  generateSessionId,
  buildAnalyzeMessages,
  buildMessagesToSaveForAnalyze,
} from '../utils/messageBuilders';

const router = Router();

/**
 * POST /api/analyze - 分析 HTML 内容
 * 注意：验签已在 server.ts 中全局应用
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const requestData: AnalyzeRequest = req.body;

    // 验证必需参数
    const validationError = validateAnalyzeRequest(requestData);
    if (validationError) {
      return res.status(400).json({
        error: validationError,
      });
    }

    // 获取或生成 sessionId
    const sessionId = requestData.sessionId || generateSessionId();

    // 获取历史消息
    const historyMessages = messageStore.getSessionMessages(sessionId);

    // 判断是否是第一次对话
    const isFirstConversation = historyMessages.length === 0;

    logger.info('收到分析请求', {
      sessionId,
      url: requestData.url,
      title: requestData.title,
      task: requestData.task,
      htmlLength: requestData.html?.length || 0,
      axTreeLength: requestData.axTree?.length || 0,
      historyMessageCount: historyMessages.length,
      isFirstConversation,
    });

    // 构建最终消息列表
    const allMessages = buildAnalyzeMessages(requestData, historyMessages);

    logger.info('处理分析请求', {
      sessionId,
      historyMessageCount: historyMessages.length,
      isFirstConversation,
      totalMessageCount: allMessages.length,
    });

    // 调用 LLM 服务进行分析
    const response = await llmClient.chat({
      messages: allMessages,
      model: requestData.module || config.llm.defaultModel,
      temperature: 0.3, // 使用较低的温度以获得更准确的分析结果
      max_tokens: 4000, // 分析结果可能需要较长的输出
    });

    // 提取助手回复
    const assistantMessage = response.choices[0]?.message;

    if (assistantMessage) {
      // 构建需要保存的消息列表
      const messagesToSave = buildMessagesToSaveForAnalyze(
        requestData,
        historyMessages,
        assistantMessage
      );

      // 批量保存消息
      if (messagesToSave.length > 0) {
        messageStore.addMessages(sessionId, messagesToSave);
      }

      logger.info('消息已保存到历史', {
        sessionId,
        savedMessages: messagesToSave.length,
        hasToolCalls: !!(assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0),
      });
    }

    // 返回分析结果，包含 tool_calls 供浏览器端执行
    res.json({
      success: true,
      data: {
        analysis: response.choices[0]?.message?.content || '',
        tool_calls: response.choices[0]?.message?.tool_calls,
        usage: response.usage,
      },
      sessionId, // 在响应中包含 sessionId，方便客户端后续使用
    });
  } catch (error) {
    logger.error('处理分析请求时出错', error);
    const { statusCode, response: errorResponse } = handleApiError(error);
    res.status(statusCode).json(errorResponse);
  }
});

/**
 * GET /api/analyze - 健康检查
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Analyze API 运行正常',
    timestamp: new Date().toISOString(),
  });
});

export default router;

