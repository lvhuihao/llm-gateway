/**
 * PM2 进程管理配置文件
 */
module.exports = {
  apps: [
    {
      name: 'llm-gateway',
      script: 'dist/server.js',
      interpreter: 'node',
      interpreter_args: '-r tsconfig-paths/register',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // 自动重启配置
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      // 日志配置
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 进程管理
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      // 优雅关闭
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
};

