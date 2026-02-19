// PM2 Ecosystem Configuration
// Run: pm2 start scripts/ecosystem.config.cjs
// Monitor: pm2 monit

// PM2 Ecosystem Configuration
// Run: pm2 start scripts/ecosystem.config.cjs
// Monitor: pm2 monit

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

    // PocketOption 1m candle collector (read-only)
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
        PO_URL: 'https://pocketoption.com',
        PO_SYMBOL: 'EURUSD',
        PO_HEADLESS: '1',
        PO_MEM_RESTART_MB: '2500',
        COLLECTOR_URL: 'http://127.0.0.1:3001',
      },
    },
  ],
}
