import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getRedisClient, isRedisAvailable } from '../utils/redis';
import type Redis from 'ioredis';

// 内存存储（作为 Redis 不可用时的回退方案）
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const memoryStore: RateLimitStore = {};

// 清理过期记录（仅用于内存存储）
setInterval(() => {
  const now = Date.now();
  Object.keys(memoryStore).forEach((key) => {
    if (memoryStore[key].resetTime < now) {
      delete memoryStore[key];
    }
  });
}, 60000); // 每分钟清理一次

/**
 * 获取客户端标识（IP 地址）
 */
const getClientId = (req: Request): string => {
  // 优先使用 X-Forwarded-For（如果部署在反向代理后）
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (forwarded as string).split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

/**
 * 使用 Redis 进行限流检查
 */
const checkRateLimitWithRedis = async (
  redis: Redis,
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; count: number; resetTime: number }> => {
  try {
    const now = Date.now();
    const windowKey = `ratelimit:${key}`;

    // 使用 Redis 的 INCR 和 EXPIRE 实现滑动窗口限流
    const count = await redis.incr(windowKey);
    
    // 如果是第一次设置，设置过期时间
    if (count === 1) {
      await redis.pexpire(windowKey, windowMs);
    }

    // 获取过期时间
    const ttl = await redis.pttl(windowKey);
    const resetTime = now + (ttl > 0 ? ttl : windowMs);

    console.log('key', key);
    console.log('resetTime', resetTime);
    console.log('count', count);
    console.log('maxRequests', maxRequests);
    console.log('allowed', count <= maxRequests);

    return {
      allowed: count <= maxRequests,
      count,
      resetTime,
    };
  } catch (error) {
    logger.error('Redis 限流检查失败', error);
    // Redis 错误时，允许请求通过（fail-open 策略）
    return {
      allowed: true,
      count: 0,
      resetTime: Date.now() + windowMs,
    };
  }
};

/**
 * 使用内存存储进行限流检查
 */
const checkRateLimitWithMemory = (
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; count: number; resetTime: number } => {
  const now = Date.now();
  let record = memoryStore[key];

  if (!record || record.resetTime < now) {
    // 创建新记录
    record = {
      count: 1,
      resetTime: now + windowMs,
    };
    memoryStore[key] = record;
    return {
      allowed: true,
      count: 1,
      resetTime: record.resetTime,
    };
  }

  // 增加计数
  record.count++;

  return {
    allowed: record.count <= maxRequests,
    count: record.count,
    resetTime: record.resetTime,
  };
};

/**
 * 限流中间件
 */
export const rateLimitMiddleware = (
  maxRequests: number = config.rateLimit.maxRequests,
  windowMs: number = config.rateLimit.windowMs
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientId = getClientId(req);
    const key = `${clientId}:${req.path}`;

    let result: { allowed: boolean; count: number; resetTime: number };

    // 优先使用 Redis，如果不可用则使用内存存储
    const redis = getRedisClient();
    if (redis && isRedisAvailable()) {
      result = await checkRateLimitWithRedis(redis, key, maxRequests, windowMs);
    } else {
      result = checkRateLimitWithMemory(key, maxRequests, windowMs);
    }

    // 检查是否超过限制
    if (!result.allowed) {
      logger.warn('请求频率超限', {
        clientId,
        path: req.path,
        count: result.count,
        maxRequests,
      });

      res.status(429).json({
        error: {
          message: '请求频率过高，请稍后再试',
          type: 'RateLimitExceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        },
      });
      return;
    }

    next();
  };
};
