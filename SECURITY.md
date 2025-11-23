# LLM Gateway 安全方案

## 概述

本文档详细说明了 LLM Gateway 项目的安全防护方案。由于该服务涉及大模型 API 调用（每次调用都会产生费用），需要实施多层安全防护措施，防止恶意调用和攻击。

## 安全威胁分析

1. **恶意调用**：攻击者可能通过脚本批量调用 API，导致成本激增
2. **重放攻击**：截获合法请求后重复发送
3. **未授权访问**：绕过签名验证直接调用接口
4. **资源耗尽**：通过大量请求耗尽服务器资源
5. **成本失控**：单次请求 token 数量过大或调用频率过高

## 安全方案设计

### 1. 多层限流策略

#### 问题
当前配置中有限流参数，但未实际实现限流功能。

#### 方案
- **IP 级别限流**：防止单个 IP 恶意调用
- **用户级别限流**：基于签名中的用户标识进行限流
- **全局限流**：保护整体服务不被过载

#### 实现方式
创建 `src/middleware/rateLimit.ts` 中间件，实现基于内存的限流（生产环境建议使用 Redis）。

**关键配置**：
- `RATE_LIMIT_MAX_REQUESTS`: 时间窗口内最大请求数（默认：100）
- `RATE_LIMIT_WINDOW_MS`: 时间窗口大小（默认：60000ms，即 1 分钟）

### 2. 防重放攻击增强

#### 问题
当前签名验证只有时间戳，缺少 nonce 机制，无法防止签名被重复使用。

#### 方案
- 在签名中加入 nonce（一次性随机数）
- 使用 Redis 或内存存储记录已使用的 nonce
- 防止签名被重复使用

#### 实现方式
修改 `src/utils/crypto.ts`，添加 `generateSignatureWithNonce` 和 `verifySignatureWithNonce` 函数。

**关键点**：
- 每个签名包含唯一的 nonce
- 验证时检查 nonce 是否已被使用
- 已使用的 nonce 会被记录，防止重复使用

### 3. 成本控制机制

#### 问题
每次调用都产生费用，需要严格控制成本。

#### 方案
- **Token 数量限制**：限制单次请求的 max_tokens
- **请求频率限制**：限制每个用户/IP 的调用频率
- **每日/每月配额**：设置调用次数上限
- **请求大小限制**：限制请求体大小（当前 50mb，可进一步收紧）

#### 实现方式
创建 `src/middleware/costControl.ts` 中间件。

**关键配置**：
- `MAX_TOKENS_PER_REQUEST`: 单次请求最大 token 数（默认：4000）
- `DAILY_REQUEST_LIMIT`: 每日最大调用次数（默认：100）
- `MONTHLY_REQUEST_LIMIT`: 每月最大调用次数（默认：2000）

### 4. IP 白名单/黑名单

#### 方案
- 支持配置 IP 白名单（仅允许特定 IP 访问）
- 支持 IP 黑名单（自动封禁恶意 IP）
- 自动检测异常 IP 并临时封禁

#### 实现方式
创建 `src/middleware/ipFilter.ts` 中间件。

**关键配置**：
- `ENABLE_IP_WHITELIST`: 是否启用白名单（默认：false）
- `ENABLE_IP_BLACKLIST`: 是否启用黑名单（默认：true）
- `IP_WHITELIST`: 白名单 IP 列表（逗号分隔）
- `IP_BLACKLIST`: 黑名单 IP 列表（逗号分隔）

### 5. 请求超时控制

#### 方案
- 为 LLM 调用设置超时时间
- 防止长时间占用资源

#### 实现方式
在 `src/services/llmClient.ts` 中使用 AbortController 实现请求超时。

**关键配置**：
- `LLM_REQUEST_TIMEOUT`: 请求超时时间（毫秒，默认：30000）

### 6. 监控和告警

#### 方案
- 记录所有 API 调用（包含成本信息）
- 异常检测（异常频率、异常 IP）
- 成本统计和告警

## 具体实现代码

### 第一步：实现限流中间件

创建 `src/middleware/rateLimit.ts`：

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';

// 简单的内存存储（生产环境建议使用 Redis）
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// 清理过期记录
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 60000); // 每分钟清理一次

/**
 * 获取客户端标识（IP 地址）
 */
const getClientId = (req: Request): string => {
  // 优先使用 X-Forwarded-For（如果部署在反向代理后）
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (forwarded as string).split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

/**
 * 限流中间件
 */
export const rateLimitMiddleware = (
  maxRequests: number = config.rateLimit.maxRequests,
  windowMs: number = config.rateLimit.windowMs
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = getClientId(req);
    const now = Date.now();
    const key = `${clientId}:${req.path}`;

    // 获取或初始化记录
    let record = store[key];

    if (!record || record.resetTime < now) {
      // 创建新记录
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      store[key] = record;
      next();
      return;
    }

    // 检查是否超过限制
    if (record.count >= maxRequests) {
      logger.warn('请求频率超限', {
        clientId,
        path: req.path,
        count: record.count,
        maxRequests,
      });

      res.status(429).json({
        error: {
          message: '请求频率过高，请稍后再试',
          type: 'RateLimitExceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
        },
      });
      return;
    }

    // 增加计数
    record.count++;
    next();
  };
};
```

### 第二步：增强签名验证（添加 nonce 防重放）

修改 `src/utils/crypto.ts`，添加以下函数：

```typescript
import { createHash } from 'crypto';

// Nonce 存储（生产环境建议使用 Redis）
const usedNonces = new Set<string>();

// 清理过期的 nonce（5 分钟后清理）
setInterval(() => {
  // 简单实现：定期清理（实际应该基于时间戳）
  if (usedNonces.size > 10000) {
    usedNonces.clear();
  }
}, 5 * 60 * 1000);

/**
 * 生成签名（增强版，包含 nonce）
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
 */
export const verifySignatureWithNonce = (
  signature: string,
  data: string,
  maxAge: number = 5 * 60 * 1000
): { valid: boolean; nonce?: string } => {
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
    if (usedNonces.has(nonce)) {
      return { valid: false };
    }

    // 记录已使用的 nonce
    usedNonces.add(nonce);

    return { valid: true, nonce };
  } catch (error) {
    return { valid: false };
  }
};
```

### 第三步：创建成本控制中间件

创建 `src/middleware/costControl.ts`：

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';

// 用户配额存储（生产环境建议使用数据库或 Redis）
interface UserQuota {
  dailyCount: number;
  dailyResetTime: number;
  monthlyCount: number;
  monthlyResetTime: number;
}

const userQuotas: Map<string, UserQuota> = new Map();

/**
 * 成本控制中间件
 * 限制单次请求的 token 数量、每日/每月调用次数
 */
export const costControlMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 1. 检查单次请求的 max_tokens 限制
    const maxTokens = req.body.max_tokens;
    const MAX_TOKENS_PER_REQUEST = parseInt(
      process.env.MAX_TOKENS_PER_REQUEST || '4000',
      10
    );

    if (maxTokens && maxTokens > MAX_TOKENS_PER_REQUEST) {
      logger.warn('请求 token 数量超限', {
        requested: maxTokens,
        maxAllowed: MAX_TOKENS_PER_REQUEST,
        path: req.path,
      });

      res.status(400).json({
        error: {
          message: `单次请求的 token 数量不能超过 ${MAX_TOKENS_PER_REQUEST}`,
          type: 'TokenLimitExceeded',
          code: 'TOKEN_LIMIT_EXCEEDED',
        },
      });
      return;
    }

    // 2. 检查用户配额（如果有用户标识）
    // 这里可以从签名中提取用户 ID，或者使用 IP
    const userId = req.headers['x-user-id'] as string || req.ip;
    const now = Date.now();

    let quota = userQuotas.get(userId);

    if (!quota) {
      quota = {
        dailyCount: 0,
        dailyResetTime: now + 24 * 60 * 60 * 1000,
        monthlyCount: 0,
        monthlyResetTime: now + 30 * 24 * 60 * 60 * 1000,
      };
      userQuotas.set(userId, quota);
    }

    // 重置每日配额
    if (quota.dailyResetTime < now) {
      quota.dailyCount = 0;
      quota.dailyResetTime = now + 24 * 60 * 60 * 1000;
    }

    // 重置每月配额
    if (quota.monthlyResetTime < now) {
      quota.monthlyCount = 0;
      quota.monthlyResetTime = now + 30 * 24 * 60 * 60 * 1000;
    }

    const DAILY_LIMIT = parseInt(process.env.DAILY_REQUEST_LIMIT || '100', 10);
    const MONTHLY_LIMIT = parseInt(
      process.env.MONTHLY_REQUEST_LIMIT || '2000',
      10
    );

    // 检查每日限制
    if (quota.dailyCount >= DAILY_LIMIT) {
      logger.warn('用户每日配额已用完', {
        userId,
        dailyCount: quota.dailyCount,
        limit: DAILY_LIMIT,
      });

      res.status(429).json({
        error: {
          message: '今日调用次数已达上限，请明天再试',
          type: 'DailyQuotaExceeded',
          code: 'DAILY_QUOTA_EXCEEDED',
        },
      });
      return;
    }

    // 检查每月限制
    if (quota.monthlyCount >= MONTHLY_LIMIT) {
      logger.warn('用户每月配额已用完', {
        userId,
        monthlyCount: quota.monthlyCount,
        limit: MONTHLY_LIMIT,
      });

      res.status(429).json({
        error: {
          message: '本月调用次数已达上限',
          type: 'MonthlyQuotaExceeded',
          code: 'MONTHLY_QUOTA_EXCEEDED',
        },
      });
      return;
    }

    // 增加计数（在请求成功后，这里先预增加）
    quota.dailyCount++;
    quota.monthlyCount++;

    // 将配额信息附加到请求对象，供后续使用
    (req as any).userQuota = quota;

    next();
  };
};
```

### 第四步：创建 IP 白名单/黑名单中间件

创建 `src/middleware/ipFilter.ts`：

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * 获取客户端 IP
 */
const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (forwarded as string).split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

/**
 * IP 白名单/黑名单中间件
 */
export const ipFilterMiddleware = () => {
  // 从环境变量读取配置
  const whitelist = process.env.IP_WHITELIST
    ? process.env.IP_WHITELIST.split(',').map((ip) => ip.trim())
    : [];
  const blacklist = process.env.IP_BLACKLIST
    ? process.env.IP_BLACKLIST.split(',').map((ip) => ip.trim())
    : [];

  const enableWhitelist = process.env.ENABLE_IP_WHITELIST === 'true';
  const enableBlacklist = process.env.ENABLE_IP_BLACKLIST !== 'false';

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = getClientIp(req);

    // 检查黑名单
    if (enableBlacklist && blacklist.includes(clientIp)) {
      logger.warn('IP 在黑名单中，拒绝访问', { ip: clientIp });
      res.status(403).json({
        error: {
          message: '访问被拒绝',
          type: 'Forbidden',
          code: 'IP_BLACKLISTED',
        },
      });
      return;
    }

    // 检查白名单
    if (enableWhitelist) {
      if (whitelist.length > 0 && !whitelist.includes(clientIp)) {
        logger.warn('IP 不在白名单中，拒绝访问', { ip: clientIp });
        res.status(403).json({
          error: {
            message: '访问被拒绝',
            type: 'Forbidden',
            code: 'IP_NOT_WHITELISTED',
          },
        });
        return;
      }
    }

    next();
  };
};
```

### 第五步：修改 server.ts 应用所有中间件

在 `server.ts` 中按顺序应用中间件：

```typescript
// ... existing code ...

// 1. IP 过滤（最先执行）
import { ipFilterMiddleware } from './middleware/ipFilter';
app.use(ipFilterMiddleware());

// 2. 请求日志中间件
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// 3. 限流中间件（在验签之前）
import { rateLimitMiddleware } from './middleware/rateLimit';
app.use('/api', rateLimitMiddleware());

// 4. 全局验签中间件
app.use((req, res, next) => {
  if (req.path === '/') {
    next();
    return;
  }
  if (req.path.startsWith('/api')) {
    verifyAESAuth(req, res, next);
  } else {
    next();
  }
});

// 5. 成本控制中间件（在路由之前）
import { costControlMiddleware } from './middleware/costControl';
app.use('/api', costControlMiddleware());

// ... existing routes ...
```

### 第六步：更新环境变量配置

在 `env.example` 中添加以下配置：

```bash
# 限流配置
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000

# 成本控制配置
MAX_TOKENS_PER_REQUEST=4000
DAILY_REQUEST_LIMIT=100
MONTHLY_REQUEST_LIMIT=2000

# IP 过滤配置
ENABLE_IP_WHITELIST=false
ENABLE_IP_BLACKLIST=true
IP_WHITELIST=127.0.0.1,192.168.1.1
IP_BLACKLIST=

# 请求超时配置
LLM_REQUEST_TIMEOUT=30000
```

### 第七步：添加请求超时控制

在 `src/services/llmClient.ts` 中添加超时控制：

```typescript
// 在调用 LLM API 时添加超时
const REQUEST_TIMEOUT = parseInt(process.env.LLM_REQUEST_TIMEOUT || '30000', 10);

// 使用 AbortController 实现超时
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

try {
  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  return response;
} catch (error) {
  clearTimeout(timeoutId);
  if (error.name === 'AbortError') {
    throw new Error('请求超时');
  }
  throw error;
}
```

## 中间件执行顺序

正确的中间件执行顺序非常重要，建议按以下顺序：

1. **IP 过滤** - 最早执行，直接拒绝黑名单 IP
2. **请求日志** - 记录所有请求
3. **限流** - 在验签之前，减少无效请求的处理成本
4. **签名验证** - 验证请求合法性
5. **成本控制** - 在路由处理之前，检查配额和限制
6. **路由处理** - 实际业务逻辑

## 环境变量配置说明

### 限流配置
- `RATE_LIMIT_MAX_REQUESTS`: 时间窗口内最大请求数（默认：100）
- `RATE_LIMIT_WINDOW_MS`: 时间窗口大小，单位毫秒（默认：60000，即 1 分钟）

### 成本控制配置
- `MAX_TOKENS_PER_REQUEST`: 单次请求最大 token 数（默认：4000）
- `DAILY_REQUEST_LIMIT`: 每日最大调用次数（默认：100）
- `MONTHLY_REQUEST_LIMIT`: 每月最大调用次数（默认：2000）

### IP 过滤配置
- `ENABLE_IP_WHITELIST`: 是否启用 IP 白名单（默认：false）
- `ENABLE_IP_BLACKLIST`: 是否启用 IP 黑名单（默认：true）
- `IP_WHITELIST`: 白名单 IP 列表，逗号分隔（例如：`127.0.0.1,192.168.1.1`）
- `IP_BLACKLIST`: 黑名单 IP 列表，逗号分隔

### 请求超时配置
- `LLM_REQUEST_TIMEOUT`: LLM API 请求超时时间，单位毫秒（默认：30000，即 30 秒）

## 生产环境增强建议

### 1. 使用 Redis 存储

当前实现使用内存存储，存在以下问题：
- 多实例部署时无法共享数据
- 服务重启后数据丢失
- 内存占用可能过大

**建议**：使用 Redis 存储限流数据、nonce 记录和用户配额。

### 2. 监控和告警

**建议实施**：
- 使用 Prometheus + Grafana 进行监控
- 记录所有 API 调用的详细信息（IP、时间、成本等）
- 设置告警规则：
  - 异常高的调用频率
  - 异常 IP 访问
  - 成本超过阈值
  - 错误率异常

### 3. 自动 IP 封禁

**建议实施**：
- 检测异常行为模式（如短时间内大量请求）
- 自动将异常 IP 加入黑名单
- 支持临时封禁和永久封禁

### 4. 用户认证系统

如果需要支持多用户，建议：
- 实现用户注册和登录
- 为每个用户分配独立的配额
- 支持不同用户级别的限制策略

### 5. 成本统计和报告

**建议实施**：
- 记录每次调用的 token 使用量
- 计算实际成本（基于 token 数量和模型价格）
- 生成每日/每月成本报告
- 提供成本查询 API

### 6. 请求签名增强

**建议实施**：
- 在签名中包含更多信息（如用户 ID、请求路径等）
- 支持签名轮换（定期更换密钥）
- 实现签名版本管理

## 安全检查清单

在部署到生产环境前，请确认：

- [ ] 已设置强密码的 `AES_SECRET_KEY`
- [ ] 已配置合适的限流参数
- [ ] 已设置成本控制限制
- [ ] 已配置 IP 黑名单（如需要）
- [ ] 已启用请求超时控制
- [ ] 已配置日志记录
- [ ] 已设置监控和告警
- [ ] 已测试所有安全中间件
- [ ] 已备份环境变量配置
- [ ] 已设置 HTTPS（如果对外提供服务）

## 常见问题

### Q: 如何调整限流参数？
A: 修改环境变量 `RATE_LIMIT_MAX_REQUESTS` 和 `RATE_LIMIT_WINDOW_MS`，重启服务生效。

### Q: 如何临时封禁某个 IP？
A: 将 IP 添加到环境变量 `IP_BLACKLIST` 中，重启服务生效。或实现动态 IP 管理接口。

### Q: 如何查看当前配额使用情况？
A: 当前实现使用内存存储，可以通过日志查看。建议实现配额查询 API。

### Q: 多实例部署时如何共享限流数据？
A: 需要使用 Redis 等共享存储，替换当前的内存存储实现。

## 更新日志

- 2024-XX-XX: 初始版本，包含基础安全方案

