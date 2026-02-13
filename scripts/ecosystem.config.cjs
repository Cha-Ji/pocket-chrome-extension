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
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
}
