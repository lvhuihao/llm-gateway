import { Router, Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/models - 获取支持的模型列表和配置信息
// 注意：验签已在 server.ts 中全局应用
router.get('/', (req: Request, res: Response) => {
  try {
    logger.info('获取模型列表请求');

    res.json({
      defaultModel: config.llm.defaultModel,
      supportedModels: config.llm.supportedModels,
      defaultParams: config.llm.defaultParams,
      modelValidationEnabled: config.llm.enableModelValidation,
    });
  } catch (error) {
    logger.error('获取模型列表时出错', error);
    res.status(500).json({
      error: {
        message: '获取模型列表失败',
        type: 'InternalServerError',
      },
    });
  }
});

export default router;

