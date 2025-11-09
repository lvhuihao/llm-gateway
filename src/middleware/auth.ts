import { Request, Response, NextFunction } from 'express';
import { verifySignature } from '../utils/crypto';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * AES 加密验证中间件
 * 验证请求中的 signature 参数
 */
export const verifyAESAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // 检查是否启用加密验证
    if (!config.auth.enableAESAuth) {
      logger.debug('AES 加密验证已禁用，跳过验证');
      next();
      return;
    }

    // 获取签名参数（可以从 query、body 或 header 中获取）
    const signature = 
      req.query.signature as string || 
      req.body.signature as string || 
      req.headers['x-signature'] as string;

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
    // 对于 POST 请求，使用请求体（排除 signature 字段）
    // 对于 GET 请求，使用查询参数（排除 signature 字段）
    let dataToVerify = '';

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const body = { ...req.body };
      delete body.signature;
      dataToVerify = JSON.stringify(body);
    } else {
      const query = { ...req.query };
      delete query.signature;
      dataToVerify = JSON.stringify(query);
    }

    // 验证签名（使用配置中的签名有效期）
    const isValid = verifySignature(signature, dataToVerify, config.auth.signatureMaxAge);

    if (!isValid) {
      logger.warn('签名验证失败', {
        path: req.path,
        method: req.method,
        ip: req.ip,
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

