import crypto from 'crypto';
import { getRedisClient, isRedisAvailable } from './redis';
import type Redis from 'ioredis';

/**
 * AES 加密配置
 */
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // 初始化向量长度（字节）
const KEY_LENGTH = 32; // 密钥长度（字节）

/**
 * 从环境变量获取或生成密钥
 * @returns 密钥 Buffer
 * @throws Error 如果环境变量未设置
 */
const getSecretKey = (): Buffer => {
  const secretKey = process.env.AES_SECRET_KEY;

  if (!secretKey) {
    throw new Error('AES_SECRET_KEY 环境变量未设置');
  }

  // 如果密钥长度不够，使用 SHA256 哈希生成固定长度的密钥
  if (secretKey.length < KEY_LENGTH) {
    return crypto.createHash('sha256').update(secretKey).digest();
  }

  // 如果密钥长度超过，截取前32字节
  return Buffer.from(secretKey.slice(0, KEY_LENGTH));
};

/**
 * AES 加密
 * @param text 要加密的文本
 * @returns 加密后的字符串（格式：iv:encryptedData，都是 base64 编码）
 * @throws Error 如果加密失败
 */
export const encrypt = (text: string): string => {
  try {
    const key = getSecretKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // 返回 iv 和加密数据的组合（用冒号分隔，都是 base64）
    return `${iv.toString('base64')}:${encrypted}`;
  } catch (error) {
    throw new Error(`加密失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * AES 解密
 * @param encryptedText 加密的文本（格式：iv:encryptedData）
 * @returns 解密后的原始文本
 * @throws Error 如果解密失败或格式错误
 */
export const decrypt = (encryptedText: string): string => {
  try {
    const key = getSecretKey();
    const parts = encryptedText.split(':');

    if (parts.length !== 2) {
      throw new Error('加密数据格式错误');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`解密失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * 生成签名
 * 对请求数据和时间戳进行加密，生成签名
 * @param data 要签名的数据（通常是请求体字符串）
 * @param timestamp 时间戳（可选，如果不提供则使用当前时间）
 * @returns 签名字符串
 */
export const generateSignature = (data: string, timestamp?: number): string => {
  const ts = timestamp || Date.now();
  const signData = `${ts}:${data}`;
  return encrypt(signData);
};

/**
 * 验证签名
 * @param signature 签名字符串
 * @param data 原始数据
 * @param maxAge 签名最大有效期（毫秒），默认 5 分钟
 * @returns 验证是否通过
 */
export const verifySignature = (
  signature: string,
  data: string,
  maxAge: number = 5 * 60 * 1000
): boolean => {
  try {
    const decrypted = decrypt(signature);
    const parts = decrypted.split(':');

    if (parts.length < 2) {
      return false;
    }

    const timestamp = parseInt(parts[0], 10);
    const originalData = parts.slice(1).join(':');

    // 验证数据是否匹配
    if (originalData !== data) {
      return false;
    }

    // 验证时间戳是否在有效期内
    const now = Date.now();
    const age = now - timestamp;

    if (age < 0 || age > maxAge) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

// Nonce 存储（内存存储作为 Redis 不可用时的回退方案）
const usedNonces = new Set<string>();

// 清理过期的 nonce（仅用于内存存储，5 分钟后清理）
setInterval(() => {
  // 简单实现：定期清理（实际应该基于时间戳）
  if (usedNonces.size > 10000) {
    usedNonces.clear();
  }
}, 5 * 60 * 1000);

/**
 * 检查 nonce 是否已被使用（使用 Redis）
 */
const checkNonceWithRedis = async (
  redis: Redis,
  nonce: string,
  maxAge: number
): Promise<boolean> => {
  try {
    const key = `nonce:${nonce}`;
    
    // 尝试设置 key，如果已存在则返回 false（表示已被使用）
    const result = await redis.set(key, '1', 'PX', maxAge, 'NX');
    
    // SET ... NX 返回 'OK' 表示设置成功（nonce 未被使用）
    // 返回 null 表示 key 已存在（nonce 已被使用）
    return result === 'OK';
  } catch (error) {
    // Redis 错误时，允许通过（fail-open 策略）
    return true;
  }
};

/**
 * 检查 nonce 是否已被使用（使用内存存储）
 */
const checkNonceWithMemory = (nonce: string): boolean => {
  if (usedNonces.has(nonce)) {
    return false;
  }
  usedNonces.add(nonce);
  return true;
};

/**
 * 生成签名（增强版，包含 nonce）
 * @param data 要签名的数据（通常是请求体字符串）
 * @param timestamp 时间戳（可选，如果不提供则使用当前时间）
 * @param nonce 一次性随机数（可选，如果不提供则自动生成）
 * @returns 签名字符串
 */
export const generateSignatureWithNonce = (
  data: string,
  timestamp?: number,
  nonce?: string
): string => {
  const ts = timestamp || Date.now();
  const nonceValue = nonce || crypto.randomBytes(16).toString('hex');
  const signData = `${ts}:${nonceValue}:${data}`;
  return encrypt(signData);
};

/**
 * 验证签名（增强版，检查 nonce 防重放）
 * @param signature 签名字符串
 * @param data 原始数据
 * @param maxAge 签名最大有效期（毫秒），默认 5 分钟
 * @returns 验证结果对象，包含是否有效和 nonce 值
 */
export const verifySignatureWithNonce = async (
  signature: string,
  data: string,
  maxAge: number = 5 * 60 * 1000
): Promise<{ valid: boolean; nonce?: string }> => {
  try {
    const decrypted = decrypt(signature);
    const parts = decrypted.split(':');

    if (parts.length < 3) {
      return { valid: false };
    }

    const timestamp = parseInt(parts[0], 10);
    const nonce = parts[1];
    const originalData = parts.slice(2).join(':');

    // 验证数据是否匹配
    if (originalData !== data) {
      return { valid: false };
    }

    // 验证时间戳是否在有效期内
    const now = Date.now();
    const age = now - timestamp;

    if (age < 0 || age > maxAge) {
      return { valid: false };
    }

    // 检查 nonce 是否已被使用（防重放攻击）
    // 优先使用 Redis，如果不可用则使用内存存储
    const redis = getRedisClient();
    let nonceValid: boolean;
    
    if (redis && isRedisAvailable()) {
      nonceValid = await checkNonceWithRedis(redis, nonce, maxAge);
    } else {
      nonceValid = checkNonceWithMemory(nonce);
    }

    if (!nonceValid) {
      return { valid: false };
    }

    return { valid: true, nonce };
  } catch (error) {
    return { valid: false };
  }
};

