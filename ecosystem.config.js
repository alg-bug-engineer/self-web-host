const { loadEnvConfig } = require('@next/env')

loadEnvConfig(__dirname)

module.exports = {
    apps: [
      {
        name: 'ai-knowledgepoints',
        script: 'npm',
        args: 'run start -- --port 3011',
        cwd: __dirname,
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env: {
          NODE_ENV: 'production',
          PORT: '3011',
          HOSTNAME: '0.0.0.0',
          ANALYTICS_DATA_DIR: process.env.ANALYTICS_DATA_DIR || '/root/self-web-host-data',
          ANALYTICS_HASH_SALT: process.env.ANALYTICS_HASH_SALT || '',
          APP_COMMIT_SHA: process.env.APP_COMMIT_SHA || 'unknown'
        },
      },
    ],
  }
