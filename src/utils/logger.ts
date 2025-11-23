import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { config } from '@/config';

/**
 * 日志级别类型
 */
type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

/**
 * 创建日志目录（如果不存在）
 */
const ensureLogDir = (logDir: string): void => {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};

/**
 * 自定义日志格式
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * 控制台日志格式（开发环境使用彩色输出）
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

/**
 * 创建文件传输配置
 */
const createFileTransport = (logDir: string, level: string, maxSize: string, maxDays: number): DailyRotateFile => {
  return new DailyRotateFile({
    level,
    filename: path.join(logDir, `%DATE%-${level}.log`),
    datePattern: 'YYYY-MM-DD',
    maxSize,
    maxFiles: `${maxDays}d`,
    format: customFormat,
    zippedArchive: true, // 压缩旧日志文件
  });
};

/**
 * 创建错误日志传输配置
 */
const createErrorFileTransport = (logDir: string, maxSize: string, maxDays: number): DailyRotateFile => {
  return new DailyRotateFile({
    level: 'error',
    filename: path.join(logDir, '%DATE%-error.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize,
    maxFiles: `${maxDays}d`,
    format: customFormat,
    zippedArchive: true,
    handleExceptions: true, // 处理未捕获的异常
    handleRejections: true, // 处理未处理的 Promise 拒绝
  });
};

/**
 * 初始化 Winston Logger
 */
const initializeLogger = (): winston.Logger => {
  const logConfig = config.logger;
  const logDir = logConfig.logDir;
  
  // 确保日志目录存在
  ensureLogDir(logDir);

  const transports: winston.transport[] = [];

  // 控制台输出
  if (logConfig.enableConsoleLogging) {
    transports.push(
      new winston.transports.Console({
        level: logConfig.level,
        format: consoleFormat,
        handleExceptions: true,
        handleRejections: true,
      })
    );
  }

  // 文件输出
  if (logConfig.enableFileLogging) {
    // 所有日志文件
    transports.push(
      createFileTransport(logDir, 'info', logConfig.maxSize, logConfig.maxDays)
    );

    // 错误日志单独文件
    transports.push(
      createErrorFileTransport(logDir, logConfig.maxSize, logConfig.maxDays)
    );

    // 如果日志级别包含 debug，也创建 debug 日志文件
    if (['debug', 'verbose', 'silly'].includes(logConfig.level)) {
      transports.push(
        createFileTransport(logDir, 'debug', logConfig.maxSize, logConfig.maxDays)
      );
    }
  }

  return winston.createLogger({
    level: logConfig.level,
    format: customFormat,
    transports,
    exitOnError: false, // 不因日志错误而退出进程
  });
};

// 创建 logger 实例
const winstonLogger = initializeLogger();

/**
 * 日志工具接口
 * 保持与原有 API 兼容
 */
export const logger = {
  /**
   * 记录信息日志
   */
  info: (message: string, ...args: unknown[]): void => {
    if (args.length > 0) {
      winstonLogger.info(message, ...args);
    } else {
      winstonLogger.info(message);
    }
  },

  /**
   * 记录警告日志
   */
  warn: (message: string, ...args: unknown[]): void => {
    if (args.length > 0) {
      winstonLogger.warn(message, ...args);
    } else {
      winstonLogger.warn(message);
    }
  },

  /**
   * 记录错误日志
   */
  error: (message: string, error?: Error | unknown, ...args: unknown[]): void => {
    if (error instanceof Error) {
      winstonLogger.error(message, {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        ...(args.length > 0 ? { extra: args } : {}),
      });
    } else if (error !== undefined) {
      winstonLogger.error(message, { error, ...(args.length > 0 ? { extra: args } : {}) });
    } else if (args.length > 0) {
      winstonLogger.error(message, ...args);
    } else {
      winstonLogger.error(message);
    }
  },

  /**
   * 记录调试日志
   */
  debug: (message: string, ...args: unknown[]): void => {
    if (args.length > 0) {
      winstonLogger.debug(message, ...args);
    } else {
      winstonLogger.debug(message);
    }
  },

  /**
   * 获取底层 Winston logger（用于高级用法）
   */
  getWinstonLogger: (): winston.Logger => winstonLogger,
};
