module.exports = {
    apps: [
      {
        name: 'ai-knowledgepoints',
        script: 'node',
        args: '.next/standalone/server.js',
        cwd: '/root/self-web-host',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env: {
          NODE_ENV: 'production',
          PORT: '3011',
          HOSTNAME: '0.0.0.0'
        },
      },
    ],
  }
