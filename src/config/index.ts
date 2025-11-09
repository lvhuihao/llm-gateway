// 支持的模型列表
export const SUPPORTED_MODELS = [
  'qwen-flash',
] as const;

// 模型配置类型
export type SupportedModel = typeof SUPPORTED_MODELS[number];

// 配置管理
export const config = {
  // LLM API 配置
  llm: {
    baseUrl: process.env.LLM_API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.LLM_API_KEY || '',
    // 默认模型
    defaultModel: process.env.LLM_DEFAULT_MODEL || 'qwen-flash',
    // 支持的模型列表（从环境变量读取，用逗号分隔，如果未设置则使用默认列表）
    supportedModels: process.env.LLM_SUPPORTED_MODELS
      ? process.env.LLM_SUPPORTED_MODELS.split(',').map((m) => m.trim())
      : (SUPPORTED_MODELS as readonly string[]),
    // 模型默认参数
    defaultParams: {
      temperature: parseFloat(process.env.LLM_DEFAULT_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.LLM_DEFAULT_MAX_TOKENS || '2000', 10),
      topP: parseFloat(process.env.LLM_DEFAULT_TOP_P || '1.0'),
      frequencyPenalty: parseFloat(process.env.LLM_DEFAULT_FREQUENCY_PENALTY || '0.0'),
      presencePenalty: parseFloat(process.env.LLM_DEFAULT_PRESENCE_PENALTY || '0.0'),
    },
    // 是否启用模型验证
    enableModelValidation: process.env.LLM_ENABLE_MODEL_VALIDATION !== 'false',
  },
  // 服务配置
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  // 限流配置
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },
  // AES 加密配置
  auth: {
    // 是否启用 AES 加密验证
    enableAESAuth: process.env.ENABLE_AES_AUTH !== 'false',
    // AES 加密密钥
    secretKey: process.env.AES_SECRET_KEY || '',
    // 签名有效期（毫秒），默认 5 分钟
    signatureMaxAge: parseInt(process.env.AES_SIGNATURE_MAX_AGE || '300000', 10),
  },
};

// 验证模型是否支持
export const isModelSupported = (model: string): boolean => {
  if (!config.llm.enableModelValidation) {
    return true;
  }
  return config.llm.supportedModels.includes(model);
};

// 获取模型配置
export const getModelConfig = (model?: string) => {
  const modelName = model || config.llm.defaultModel;
  return {
    model: modelName,
    ...config.llm.defaultParams,
  };
};

// 验证必要的环境变量
export const validateConfig = (): void => {
  if (!config.llm.apiKey) {
    throw new Error('LLM_API_KEY 环境变量未设置');
  }
  if (!config.llm.baseUrl) {
    throw new Error('LLM_API_BASE_URL 环境变量未设置');
  }
  // 如果启用了 AES 验证，则必须设置密钥
  if (config.auth.enableAESAuth && !config.auth.secretKey) {
    throw new Error('启用 AES 加密验证时，AES_SECRET_KEY 环境变量必须设置');
  }
};

