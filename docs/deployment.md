# 部署文档

## 本地开发

### 环境要求
- Node.js >= 18.x
- npm >= 9.x

### 配置环境变量

创建 `.env.local` 文件：

```bash
cp .env.example .env.local
```

配置内容：

```env
# 管理后台认证
ADMIN_USERNAME=your_username
ADMIN_PASSWORD=your_password
ADMIN_SESSION_SECRET=随机字符串用于签名session

# 发布配置（生产环境使用）
ADMIN_PUBLISH_CWD=/path/to/project
ADMIN_PUBLISH_COMMAND=npm run build
```

### 启动开发服务器

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

### 本地构建测试

```bash
# 构建生产版本
npm run build

# 本地预览生产版本
npm run start
```

---

## ECS 服务器部署

### 1. 环境准备

```bash
# 安装 Node.js (推荐使用 nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# 安装 pm2
npm install -g pm2
```

### 2. 上传项目

```bash
# 方式一：Git 拉取
git clone <your-repo-url> /var/www/self-web-host
cd /var/www/self-web-host

# 方式二：scp 上传
scp -r ./self-web-host user@your-server:/var/www/
```

### 3. 配置环境变量

```bash
cd /var/www/self-web-host

# 创建生产环境配置
cat > .env.local << 'EOF'
ADMIN_USERNAME=your_username
ADMIN_PASSWORD=your_secure_password
ADMIN_SESSION_SECRET=生产环境用的长随机字符串
ADMIN_PUBLISH_CWD=/var/www/self-web-host
ADMIN_PUBLISH_COMMAND=npm run build && pm2 restart self-web-host
EOF
```

### 4. 安装依赖并构建

```bash
npm install
npm run build
```

### 5. 配置 PM2

创建 `ecosystem.config.js`：

```bash
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'self-web-host',
    script: 'npm',
    args: 'start',
    cwd: '/root/self-web-host',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 7000
    }
  }]
}
EOF
```

### 6. 启动服务

```bash
# 启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs self-web-host

# 设置开机自启
pm2 save
pm2 startup
```

### 7. PM2 常用命令

```bash
# 重启服务
pm2 restart self-web-host

# 停止服务
pm2 stop self-web-host

# 删除服务
pm2 delete self-web-host

# 查看详细信息
pm2 show self-web-host

# 监控
pm2 monit
```

---

## Nginx 反向代理（可选）

如果需要配置域名和 HTTPS：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 更新部署

### 本地开发

```bash
# 拉取最新代码
git pull

# 重新安装依赖（如有变化）
npm install

# 重启开发服务器
npm run dev
```

### ECS 服务器

```bash
cd /var/www/self-web-host

# 拉取最新代码
git pull

# 安装依赖
npm install

# 重新构建
npm run build

# 重启服务
pm2 restart self-web-host
```

或使用后台管理的"发布"按钮（生产环境会自动执行构建和重启）。

---

## 故障排查

### 查看日志

```bash
# PM2 日志
pm2 logs self-web-host --lines 100

# 实时日志
pm2 logs self-web-host -f
```

### 常见问题

1. **端口被占用**
   ```bash
   lsof -i :3000
   kill -9 <PID>
   ```

2. **构建失败**
   ```bash
   # 清除缓存重新构建
   rm -rf .next
   npm run build
   ```

3. **内存不足**
   ```bash
   # 增加 Node.js 内存限制
   NODE_OPTIONS="--max-old-space-size=2048" npm run build
   ```
