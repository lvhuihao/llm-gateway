import crypto from 'crypto';

/**
 * AES 加密配置
 */
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // 初始化向量长度（字节）
const KEY_LENGTH = 32; // 密钥长度（字节）

/**
 * 从环境变量获取或生成密钥
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
export const verifySignature = (signature: string, data: string, maxAge: number = 5 * 60 * 1000): boolean => {

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

