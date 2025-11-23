// 用户请求类型
export interface GatewayRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  sessionId?: string; // 会话ID，用于管理对话历史
  [key: string]: unknown;
}

// 消息类型
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// 工具调用类型
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
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
  sessionId?: string; // 会话ID，用于管理对话历史
}

export interface Choice {
  index: number;
  message: Message;
  finish_reason: string | null;
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

// 分析请求类型
export interface AnalyzeRequest {
  url?: string; // page url
  html?: string; // html content
  axTree?: string; // a11y tree
  title?: string; // page title
  task: string; // 任务描述
  module?: string; // 模型名称
  sessionId?: string; // 会话ID，用于管理对话历史
}
