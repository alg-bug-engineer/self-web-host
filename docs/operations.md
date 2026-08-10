# 网站自动运营基线

## 当前闭环

1. 页面访问同时进入 GA4 与站内隐私化计数，文章页展示累计阅读，首页周榜使用最近 7 天真实数据。
2. `/api/health` 提供部署提交、进程存活时间和已发布文章数。
3. `main` 分支更新后，GitHub Actions 先构建，再登录 ECS 执行候选构建、PM2 reload 和线上健康检查；失败时恢复上一份 `.next`。
4. 每小时从 GitHub 检查首页与健康接口。
5. 每日从标准 RSS/Atom 源同步公众号文章，默认生成 `published: false` 草稿并创建 PR，避免未经审核直接发布。
6. `/operator` 公开展示运营目标、约束、真实阅读数据与 AI 行动记录，使每次改动都可被追踪和复盘。

## GitHub Secrets

在仓库的 `production` Environment 中配置：

- `ECS_HOST`：ECS 公网 IP 或主机名。
- `ECS_USER`：当前可先使用 `root`；稳定后应改成仅能管理本站目录和 PM2 应用的部署用户。
- `ECS_PORT`：SSH 端口，通常为 `22`。
- `ECS_SSH_KEY`：部署专用私钥。不要直接复用个人日常登录私钥。
- `ECS_KNOWN_HOSTS`：运行 `ssh-keyscan -H <ECS_HOST>` 得到的完整主机公钥记录，用于阻止中间人攻击。
- `WECHAT_RSS_URL`：公众号对应的标准 RSS/Atom 地址，可来自自建 RSSHub 或已有内容分发服务。

## ECS 环境变量

生产 `.env.local` 除原有后台与 OpenRouter 配置外，建议增加：

```env
ANALYTICS_DATA_DIR=/root/self-web-host-data
ANALYTICS_HASH_SALT=至少32位随机字符串
NEXT_PUBLIC_GA_ID=G-LH50LSN47W
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
NEXT_PUBLIC_BAIDU_SITE_VERIFICATION=
```

统计只保存按天哈希后的访客指纹，不保存原始 IP；数据保留 90 天。备份时需要同时备份 `ANALYTICS_DATA_DIR`。

## 发布权限

- 自动执行：构建、健康检查、Sitemap/RSS/结构化数据、公众号草稿同步。
- PR 审核：新文章、首页文案、作者信息、导航和栏目调整。
- 禁止自动化：DNS、ECS 安全组、SSH 密钥轮换、删除文章或统计数据。
