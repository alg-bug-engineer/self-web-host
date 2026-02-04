module.exports = {
  apps: [
    {
      name: 'ai-knowledgepoints',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3011',
      cwd: '/root/self-web-host',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
