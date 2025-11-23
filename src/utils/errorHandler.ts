import { ErrorResponse } from '@/types';
import { logger } from './logger';

/**
 * OpenAI API 错误接口
 */
interface OpenAIError {
  status?: number;
  message?: string;
  code?: string;
  error?: {
    error?: {
      message?: string;
    };
  };
}

/**
 * 网关错误类
 * 用于表示网关层面的错误
 */
export class GatewayError extends Error {
  statusCode: number;
  code?: string;

  /**
   * 创建网关错误
   * @param message 错误消息
   * @param statusCode HTTP 状态码，默认为 500
   * @param code 错误代码
   */
  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.name = 'GatewayError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * 创建错误响应对象
 * @param error 错误对象
 * @returns 错误响应对象
 */
export const createErrorResponse = (error: unknown): ErrorResponse => {
  if (error instanceof GatewayError) {
    return {
      error: {
        message: error.message,
        code: error.code,
        type: error.name,
      },
    };
  }

  if (error instanceof Error) {
    logger.error('未处理的错误', error);
    return {
      error: {
        message: error.message || '内部服务器错误',
        type: 'InternalError',
      },
    };
  }

  return {
    error: {
      message: '未知错误',
      type: 'UnknownError',
    },
  };
};

/**
 * 处理 API 错误
 * @param error 错误对象
 * @returns 包含状态码和错误响应的对象
 */
export const handleApiError = (error: unknown): {
  statusCode: number;
  response: ErrorResponse;
} => {
  if (error instanceof GatewayError) {
    return {
      statusCode: error.statusCode,
      response: createErrorResponse(error),
    };
  }

  // 处理 OpenAI SDK 错误
  if (error && typeof error === 'object' && 'status' in error) {
    const openaiError = error as OpenAIError;
    const statusCode = openaiError.status || 500;

    // 如果 OpenAI 错误包含嵌套的 error 对象
    if (
      openaiError.error &&
      typeof openaiError.error === 'object' &&
      'error' in openaiError.error &&
      openaiError.error.error &&
      typeof openaiError.error.error === 'object' &&
      'message' in openaiError.error.error
    ) {
      return {
        statusCode,
        response: {
          error: {
            message: openaiError.error.error.message || 'API 错误',
            type: 'APIError',
            code: openaiError.code,
          },
        },
      };
    }

    // 直接使用 OpenAI 错误信息
    if (openaiError.message) {
      return {
        statusCode,
        response: {
          error: {
            message: openaiError.message,
            type: 'APIError',
            code: openaiError.code,
          },
        },
      };
    }
  }

  return {
    statusCode: 500,
    response: createErrorResponse(error),
  };
};

