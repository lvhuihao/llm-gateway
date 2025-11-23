import Redis from 'ioredis';
import { logger } from './logger';

let redisClient: Redis | null = null;

/**
 * 获取 Redis 客户端实例
 * @returns Redis 客户端实例，如果未配置则返回 null
 */
export const getRedisClient = (): Redis | null => {
  if (redisClient) {
    return redisClient;
  }

  // 检查是否配置了 Redis
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD;
  const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

  // 如果未配置 Redis URL 且未启用 Redis，返回 null（使用内存存储）
  if (!redisUrl && process.env.ENABLE_REDIS !== 'true') {
    logger.debug('Redis 未启用，使用内存存储');
    return null;
  }

  try {
    // 如果提供了 Redis URL，使用 URL 连接
    if (redisUrl) {
      redisClient = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });
    } else {
      // 否则使用单独的配置项
      redisClient = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        db: redisDb,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });
    }

    // 监听连接事件
    redisClient.on('connect', () => {
      logger.info('Redis 客户端已连接');
    });

    redisClient.on('ready', () => {
      logger.info('Redis 客户端已就绪');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis 客户端错误', error);
    });

    redisClient.on('close', () => {
      logger.warn('Redis 客户端连接已关闭');
    });

    // 尝试连接
    redisClient.connect().catch((error) => {
      logger.error('Redis 连接失败', error);
      // 连接失败时，将客户端设为 null，回退到内存存储
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    logger.error('创建 Redis 客户端失败', error);
    return null;
  }
};

/**
 * 关闭 Redis 客户端连接
 */
export const closeRedisClient = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis 客户端已关闭');
  }
};

/**
 * 检查 Redis 是否可用
 * @returns 是否可用
 */
export const isRedisAvailable = (): boolean => {
  const client = getRedisClient();
  if (!client) {
    return false;
  }
  
  // 检查连接状态：'ready' 或 'connect' 表示可用
  const status = client.status;
  return status === 'ready' || status === 'connect';
};

