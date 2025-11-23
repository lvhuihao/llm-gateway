import { Message } from '@/types';
import { logger } from '@/utils/logger';

/**
 * 会话消息存储接口
 */
interface SessionMessages {
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

/**
 * 消息存储服务
 * 负责管理会话消息的存储、检索和清理
 */
export class MessageStore {
  /**
   * 使用 Map 存储会话消息，key 为 sessionId
   */
  private sessions: Map<string, SessionMessages> = new Map();

  /**
   * 会话过期时间（默认 24 小时）
   */
  private readonly sessionTTL: number = 24 * 60 * 60 * 1000;

  /**
   * 清理检查间隔（默认 1 小时）
   */
  private readonly cleanupInterval: number = 60 * 60 * 1000;

  /**
   * 清理定时器 ID
   */
  private cleanupTimerId: NodeJS.Timeout | null = null;

  /**
   * 初始化消息存储服务
   */
  constructor() {
    // 启动定期清理过期会话
    this.startCleanupTimer();
    logger.info('消息存储服务已初始化');
  }

  /**
   * 获取会话消息
   * @param sessionId 会话ID
   * @returns 消息数组，如果会话不存在或已过期则返回空数组
   */
  getSessionMessages(sessionId: string): Message[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    // 检查会话是否过期
    if (Date.now() - session.updatedAt > this.sessionTTL) {
      this.sessions.delete(sessionId);
      logger.info('会话已过期并删除', { sessionId });
      return [];
    }

    // 返回消息的副本，避免外部修改
    return [...session.messages];
  }

  /**
   * 添加消息到会话
   * @param sessionId 会话ID
   * @param message 要添加的消息
   */
  addMessage(sessionId: string, message: Message): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      // 更新现有会话
      session.messages.push(message);
      session.updatedAt = Date.now();
    } else {
      // 创建新会话
      const now = Date.now();
      this.sessions.set(sessionId, {
        messages: [message],
        createdAt: now,
        updatedAt: now,
      });
      logger.info('创建新会话', { sessionId });
    }
  }

  /**
   * 添加多条消息到会话
   * @param sessionId 会话ID
   * @param messages 要添加的消息数组
   */
  addMessages(sessionId: string, messages: Message[]): void {
    if (messages.length === 0) {
      return;
    }

    const session = this.sessions.get(sessionId);

    if (session) {
      // 更新现有会话
      session.messages.push(...messages);
      session.updatedAt = Date.now();
    } else {
      // 创建新会话
      const now = Date.now();
      this.sessions.set(sessionId, {
        messages: [...messages],
        createdAt: now,
        updatedAt: now,
      });
      logger.info('创建新会话（批量消息）', { sessionId, messageCount: messages.length });
    }
  }

  /**
   * 清除会话
   * @param sessionId 会话ID
   * @returns 是否成功删除会话
   */
  clearSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      logger.info('会话已清除', { sessionId });
    }
    return deleted;
  }

  /**
   * 获取会话信息
   * @param sessionId 会话ID
   * @returns 会话信息对象，如果会话不存在则返回 null
   */
  getSessionInfo(sessionId: string): {
    messageCount: number;
    createdAt: number;
    updatedAt: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      messageCount: session.messages.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  /**
   * 清理过期会话
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.sessionTTL) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('清理过期会话', { cleanedCount, remainingSessions: this.sessions.size });
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupTimerId = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);
  }

  /**
   * 停止清理定时器
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimerId) {
      clearInterval(this.cleanupTimerId);
      this.cleanupTimerId = null;
    }
  }

  /**
   * 获取统计信息
   * @returns 统计信息对象
   */
  getStats(): { totalSessions: number; totalMessages: number } {
    let totalMessages = 0;
    for (const session of this.sessions.values()) {
      totalMessages += session.messages.length;
    }

    return {
      totalSessions: this.sessions.size,
      totalMessages,
    };
  }
}

// 导出单例
export const messageStore = new MessageStore();

