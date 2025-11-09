import { ErrorResponse } from '@/types';
import { logger } from './logger';

// 错误处理工具
export class GatewayError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.name = 'GatewayError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

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

export const handleApiError = (error: unknown): { statusCode: number; response: ErrorResponse } => {
  if (error instanceof GatewayError) {
    return {
      statusCode: error.statusCode,
      response: createErrorResponse(error),
    };
  }

  // 处理 OpenAI SDK 错误
  if (error && typeof error === 'object' && 'status' in error) {
    const openaiError = error as { status?: number; message?: string; code?: string; error?: unknown };
    const statusCode = openaiError.status || 500;
    
    // 如果 OpenAI 错误包含 error 对象
    if (openaiError.error && typeof openaiError.error === 'object' && 'error' in openaiError.error) {
      const errorData = (openaiError.error as { error?: unknown }).error;
      if (errorData && typeof errorData === 'object' && 'message' in errorData) {
        return {
          statusCode,
          response: {
            error: {
              message: (errorData as { message: string }).message,
              type: 'APIError',
              code: openaiError.code,
            },
          },
        };
      }
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

