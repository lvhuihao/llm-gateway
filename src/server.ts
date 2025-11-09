// 加载环境变量（必须在其他导入之前）
import 'dotenv/config';
import 'tsconfig-paths/register';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { verifyAESAuth } from './middleware/auth';
import chatRouter from './routes/chat';
import modelsRouter from './routes/models';

// 验证配置
try {
  validateConfig();
} catch (error) {
  logger.error('配置验证失败', error);
  process.exit(1);
}

const app: Express = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// 全局验签中间件（应用到所有 /api 开头的路由）
// 排除根路径健康检查
app.use((req, res, next) => {
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

// 路由
app.use('/api/chat', chatRouter);
app.use('/api/models', modelsRouter);

// 根路径健康检查
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'LLM Gateway API 服务运行正常',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

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
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  logger.error('未处理的错误', err);
  res.status(500).json({
    error: {
      message: '服务器内部错误',
      type: 'InternalServerError',
    },
  });
});

// 启动服务器
const port = config.server.port;

app.listen(port, () => {
  logger.info(`🚀 LLM Gateway 服务已启动`, {
    port,
    env: config.server.nodeEnv,
    baseUrl: `http://localhost:${port}`,
  });
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('收到 SIGINT 信号，正在关闭服务器...');
  process.exit(0);
});
