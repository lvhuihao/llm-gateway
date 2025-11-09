// 用户请求类型
export interface GatewayRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

// 消息类型
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// LLM API 请求类型
export interface LLMRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

// LLM API 响应类型
export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Choice[];
  usage?: Usage;
}

export interface Choice {
  index: number;
  message: Message;
  finish_reason: string;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// 错误响应类型
export interface ErrorResponse {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

