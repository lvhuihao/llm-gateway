# LLM Gateway

大模型 API 网关服务 - 将用户请求转发到大模型 API 的统一入口

## 简介

LLM Gateway 是一个纯后台服务，作为大模型 API 的代理网关。它接收用户侧的 API 调用，将请求转换为大模型 API 的标准格式，然后将大模型的响应返回给用户侧。

## 核心功能

- 🔄 **请求转发**：接收用户请求并转发到大模型 API
- 🔀 **请求转换**：将用户请求格式转换为大模型 API 标准格式
- 🛡️ **错误处理**：统一的错误处理和响应格式
- 📝 **日志记录**：完整的请求和响应日志
- ⚙️ **配置管理**：灵活的环境变量配置

## 技术栈

- **框架**: Express.js
- **语言**: TypeScript
- **LLM SDK**: OpenAI SDK (官方 SDK)
- **运行时**: Node.js 18+

## 项目架构

```
llm-gateway/
├── src/
│   ├── server.ts              # 服务器入口文件
│   ├── routes/                # 路由层
│   │   └── chat.ts            # 聊天 API 路由
│   ├── services/              # 业务服务层
│   │   └── llmClient.ts       # LLM API 客户端服务
│   ├── types/                 # TypeScript 类型定义
│   │   └── index.ts
│   ├── utils/                 # 工具函数
│   │   ├── logger.ts          # 日志工具
│   │   └── errorHandler.ts    # 错误处理
│   └── config/                # 配置管理
│       └── index.ts
├── dist/                      # 编译输出目录
├── .gitignore
├── .eslintrc.json
├── env.example                # 环境变量示例
├── package.json
├── tsconfig.json
└── README.md
```

## 架构说明

### 1. 服务器入口 (`src/server.ts`)
- Express 服务器初始化
- 中间件配置（CORS、JSON 解析、日志）
- 路由注册
- 错误处理
- 优雅关闭

### 2. 路由层 (`src/routes/chat.ts`)
- 接收用户 HTTP 请求
- 验证请求格式
- 调用 LLM 服务
- 返回响应

### 3. 服务层 (`src/services/llmClient.ts`)
- 封装大模型 API 调用逻辑
- 请求格式转换
- HTTP 请求处理
- 响应数据解析

### 4. 配置层 (`src/config/index.ts`)
- 统一管理环境变量
- 配置验证
- 默认值设置

### 5. 工具层 (`src/utils/`)
- 日志记录工具
- 错误处理工具
- 通用工具函数

## 开始使用

### 1. 安装依赖

```bash
npm install
# 或
yarn install
# 或
pnpm install
```

### 2. 配置环境变量

复制 `env.example` 文件为 `.env`：

```bash
cp env.example .env
```

编辑 `.env` 文件，设置以下变量：

```env
# LLM API 配置
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your-api-key-here

# 服务配置
PORT=3000
NODE_ENV=development
```

### 3. 开发

```bash
npm run dev
```

服务将在 `http://localhost:3000` 启动

### 4. 构建生产版本

```bash
npm run build
npm start
```

## API 使用说明

### POST /api/chat

发送聊天请求到大模型 API。

**请求示例：**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "你好，请介绍一下你自己"
      }
    ],
    "model": "gpt-3.5-turbo",
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

**请求参数：**

- `messages` (必需): 消息数组，每个消息包含 `role` 和 `content`
  - `role`: "system" | "user" | "assistant"
  - `content`: 消息内容
- `model` (可选): 模型名称，默认使用配置中的默认模型。如果启用了模型验证，必须使用支持的模型
- `temperature` (可选): 温度参数，控制随机性（默认：0.7）
- `max_tokens` (可选): 最大 token 数（默认：2000）
- `stream` (可选): 是否使用流式响应

**响应示例：**

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-3.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我是..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

### GET /api/chat

健康检查端点，用于检查服务是否正常运行。

**响应示例：**

```json
{
  "status": "ok",
  "message": "LLM Gateway API 运行正常",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /api/models

获取支持的模型列表和配置信息。

**响应示例：**

```json
{
  "defaultModel": "gpt-3.5-turbo",
  "supportedModels": [
    "gpt-4",
    "gpt-4-turbo",
    "gpt-4-turbo-preview",
    "gpt-4-0125-preview",
    "gpt-4-1106-preview",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k",
    "gpt-3.5-turbo-0125",
    "gpt-3.5-turbo-1106"
  ],
  "defaultParams": {
    "temperature": 0.7,
    "maxTokens": 2000,
    "topP": 1.0,
    "frequencyPenalty": 0.0,
    "presencePenalty": 0.0
  },
  "modelValidationEnabled": true
}
```

### GET /

根路径健康检查。

**响应示例：**

```json
{
  "status": "ok",
  "message": "LLM Gateway API 服务运行正常",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "0.1.0"
}
```

## 错误处理

服务使用统一的错误响应格式：

```json
{
  "error": {
    "message": "错误描述",
    "type": "错误类型",
    "code": "错误代码"
  }
}
```

常见错误码：
- `400`: 请求参数错误
- `401`: 认证失败
- `404`: 接口不存在
- `500`: 服务器内部错误

## 开发脚本

- `npm run dev` - 启动开发服务器（使用 tsx watch 自动重启）
- `npm run build` - 构建生产版本（编译 TypeScript）
- `npm start` - 启动生产服务器
- `npm run lint` - 运行 ESLint 检查
- `npm run type-check` - 运行 TypeScript 类型检查

## 许可证

MIT
