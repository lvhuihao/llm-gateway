import { Request, Response, NextFunction } from 'express';
import { verifySignature, verifySignatureWithNonce } from '../utils/crypto';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * 从请求中提取签名
 * @param req Express 请求对象
 * @returns 签名字符串，如果不存在则返回 null
 */
const extractSignature = (req: Request): string | null => {
  // 从 query、body 或 header 中获取签名
  const signature =
    (req.query.signature as string) ||
    (req.body.signature as string) ||
    (req.headers['x-signature'] as string);

  return signature || null;
};

/**
 * 生成要验证的数据字符串
 * @param req Express 请求对象
 * @returns 要验证的数据字符串
 */
const generateDataToVerify = (req: Request): string => {
  // 对于 POST/PUT/PATCH 请求，使用请求体（排除 signature 字段）
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const body = { ...req.body };
    delete body.signature;
    return JSON.stringify(body);
  }

  // 对于 GET 等其他请求，使用查询参数（排除 signature 字段）
  const query = { ...req.query };
  delete query.signature;
  return JSON.stringify(query);
};

/**
 * AES 加密验证中间件
 * 验证请求中的 signature 参数
 * @param req Express 请求对象
 * @param res Express 响应对象
 * @param next Express 下一个中间件函数
 */
export const verifyAESAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 检查是否启用加密验证
    if (!config.auth.enableAESAuth) {
      logger.debug('AES 加密验证已禁用，跳过验证');
      next();
      return;
    }

    // 获取签名参数
    const signature = extractSignature(req);
    if (!signature) {
      logger.warn('请求缺少签名参数', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      res.status(401).json({
        error: {
          message: '缺少签名参数',
          type: 'Unauthorized',
          code: 'MISSING_SIGNATURE',
        },
      });
      return;
    }

    // 生成要验证的数据字符串
    const dataToVerify = generateDataToVerify(req);

    // 验证签名（使用带 nonce 的增强版验证，防重放攻击）
    const verifyResult = await verifySignatureWithNonce(
      signature,
      dataToVerify,
      config.auth.signatureMaxAge
    );

    if (!verifyResult.valid) {
      logger.warn('签名验证失败', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        reason: verifyResult.nonce ? 'nonce 已被使用（重放攻击）' : '签名无效或已过期',
      });
      res.status(401).json({
        error: {
          message: '签名验证失败',
          type: 'Unauthorized',
          code: 'INVALID_SIGNATURE',
        },
      });
      return;
    }

    // 验证通过，继续处理请求
    logger.debug('签名验证通过', {
      path: req.path,
      method: req.method,
    });
    next();
  } catch (error) {
    logger.error('验证签名时出错', error);
    res.status(500).json({
      error: {
        message: '验证签名时发生错误',
        type: 'InternalServerError',
        code: 'AUTH_ERROR',
      },
    });
  }
};

