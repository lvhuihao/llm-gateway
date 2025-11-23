// 加载环境变量（必须在其他导入之前）
import 'dotenv/config';
import 'tsconfig-paths/register';
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { verifyAESAuth } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { closeRedisClient } from './utils/redis';
import chatRouter from './routes/chat';
import modelsRouter from './routes/models';
import analyzeRouter from './routes/analyze';

/**
 * 验证配置
 */
try {
  validateConfig();
} catch (error) {
  logger.error('配置验证失败', error);
  process.exit(1);
}

const app: Express = express();

/**
 * 配置基础中间件
 */
const setupBasicMiddleware = (): void => {
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
};

/**
 * 配置请求日志中间件
 */
const setupRequestLogging = (): void => {
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    next();
  });
};

/**
 * 配置限流中间件
 */
const setupRateLimit = (): void => {
  // 对 /api 开头的路由应用限流（在验签之前，减少无效请求的处理成本）
  app.use('/api', rateLimitMiddleware());
};

/**
 * 配置认证中间件
 */
const setupAuthMiddleware = (): void => {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // 排除根路径健康检查
    if (req.path === '/') {
      next();
      return;
    }
    // 对所有 /api 开头的路由应用验签
    if (req.path.startsWith('/api')) {
      verifyAESAuth(req, res, next);
    } else {
      next();
    }
  });
};

/**
 * 配置路由
 */
const setupRoutes = (): void => {
  app.use('/api/chat', chatRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/analyze', analyzeRouter);
};

/**
 * 配置健康检查路由
 */
const setupHealthCheck = (): void => {
  app.get('/', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      message: 'LLM Gateway API 服务运行正常',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    });
  });
};

/**
 * 配置错误处理中间件
 */
const setupErrorHandling = (): void => {
  // 404 处理
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        message: '接口不存在',
        path: req.path,
      },
    });
  });

  // 错误处理中间件
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('未处理的错误', err);
    res.status(500).json({
      error: {
        message: '服务器内部错误',
        type: 'InternalServerError',
      },
    });
  });
};

/**
 * 启动服务器
 */
const startServer = (): void => {
  const port = config.server.port;

  app.listen(port, () => {
    logger.info(`🚀 LLM Gateway 服务已启动`, {
      port,
      env: config.server.nodeEnv,
      baseUrl: `http://localhost:${port}`,
    });
  });
};

/**
 * 配置优雅关闭
 */
const setupGracefulShutdown = (): void => {
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal} 信号，正在关闭服务器...`);
    
    // 关闭 Redis 连接
    try {
      await closeRedisClient();
    } catch (error) {
      logger.error('关闭 Redis 连接时出错', error);
    }
    
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

// 初始化应用
setupBasicMiddleware();
setupRequestLogging();
setupRateLimit(); // 限流在验签之前
setupAuthMiddleware();
setupRoutes();
setupHealthCheck();
setupErrorHandling();
setupGracefulShutdown();
startServer();
