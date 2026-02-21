// PM2 Ecosystem Configuration
// Run: pm2 start scripts/ecosystem.config.cjs
// Monitor: pm2 monit
//
// 프로필 경로 통일: ~/.pocket-quant/chrome-profile/
// 최초 로그인: npm run collect:visible → PO 로그인 → Ctrl+C → 이후 headless

module.exports = {
  apps: [
    {
      name: 'data-collector',
      script: 'npx',
      args: 'tsx scripts/data-collector-server.ts',
      cwd: process.env.PROJECT_ROOT || __dirname.replace('/scripts', ''),

      // Restart policy
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,

      // Watch for changes (optional, disable in production)
      watch: false,
      ignore_watch: ['node_modules', 'data', 'coverage', 'dist'],

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './data/logs/collector-error.log',
      out_file: './data/logs/collector-out.log',
      merge_logs: true,

      // Environment
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },

    // Headless Collector — Extension 기반 AutoMiner (주력)
    {
      name: 'headless-collector',
      script: 'npx',
      args: 'tsx scripts/headless-collector.ts',
      cwd: process.env.PROJECT_ROOT || __dirname.replace('/scripts', ''),

      autorestart: true,
      max_restarts: 50,
      restart_delay: 10000,

      watch: false,
      ignore_watch: ['node_modules', 'data', 'coverage', 'dist'],

      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './data/logs/headless-collector-error.log',
      out_file: './data/logs/headless-collector-out.log',
      merge_logs: true,

      env: {
        NODE_ENV: 'production',
        HEADLESS: 'true',
        MAX_DAYS: '90',
        OFFSET: '300000',
        REQUEST_DELAY: '200',
        SESSION_HOURS: '4',
        MAX_MEMORY_MB: '1500',
        COLLECTOR_URL: 'http://127.0.0.1:3001',
      },
    },

    // PocketOption 1m candle collector (DOM 가격 관찰, 보조)
    {
      name: 'po-1m-collector',
      script: 'npx',
      args: 'tsx scripts/pocketoption-1m-collector.ts',
      cwd: process.env.PROJECT_ROOT || __dirname.replace('/scripts', ''),

      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,

      watch: false,
      ignore_watch: ['node_modules', 'data', 'coverage', 'dist'],

      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './data/logs/po-collector-error.log',
      out_file: './data/logs/po-collector-out.log',
      merge_logs: true,

      env: {
        NODE_ENV: 'production',
        PO_URL: process.env.PO_URL || 'https://pocketoption.com',
        PO_SYMBOL: process.env.PO_SYMBOL || 'EURUSD',
        PO_HEADLESS: '1',
        PO_MEM_RESTART_MB: process.env.PO_MEM_RESTART_MB || '2500',
        PO_MEM_CHECK_EVERY_MS: process.env.PO_MEM_CHECK_EVERY_MS || '15000',
        COLLECTOR_URL: process.env.COLLECTOR_URL || 'http://127.0.0.1:3001',
      },
    },
  ],
}
