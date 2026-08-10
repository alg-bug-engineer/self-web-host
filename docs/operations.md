# 网站自动运营基线

## 当前闭环

1. 页面访问同时进入 GA4 与站内隐私化计数，文章页展示累计阅读，首页周榜使用最近 7 天真实数据；私有后台另统计每日回访信号、有效阅读、50%/90% 阅读深度、页面平均投入时间，以及 LCP、INP、CLS 的真实用户第 75 百分位。
2. `/api/health` 提供部署提交、进程存活时间和已发布文章数。
3. `main` 分支更新后，GitHub Actions 先构建，再登录 ECS 执行候选构建、PM2 reload 和线上健康检查；失败时恢复上一份 `.next`。
4. 每小时从 GitHub 检查首页与健康接口。
5. 每日私有经营任务先巡检 Sitemap、canonical、noindex、JSON-LD、RSS、robots、`llms.txt`、内部链接和安全响应头，再评估部署行动，最后把技术异常、流量质量与学习结果合并进经营报告。
6. ECS 内网运行 We-MP-RSS；每日 GitHub Action 通过 SSH 读取回环地址上的 RSS，生成 `published: false` 草稿并创建 PR，避免公开管理后台或未经审核直接发布。
7. 自动化发布与监控只在服务器、GitHub Actions 和内部日志中运行，不提供面向访客的运维页面。
8. 本地 `chatgpt2api` 可每天生成一篇 `published: false` 的候选文章；模型输出需通过长度、结构和危险标签校验，且必须人工复核后发布。

## 私有经营行动与学习

每次生产部署通过健康检查后，`scripts/record-deployment.mjs` 会把提交号、上一版本、提交主题和最多 100 个变更文件写入：

```text
<ANALYTICS_DATA_DIR>/operator/deployments.jsonl
```

每日 `npm run operator:learn` 将这些部署转换为行动记录，对比部署前 7 个自然日和部署后 7 个完整自然日。只有两侧各至少 5 个数据日才输出正向、负向或混合信号，并同时记录样本置信度；结果只表示相关性，不能在没有对照实验时声称因果。行动账本保存在：

```text
<ANALYTICS_DATA_DIR>/operator/actions.json
```

“有效访客”严格定义为：当日阅读至少 10 秒、达到 25% 阅读深度或具有回访信号的隐私化访客。由于访客哈希每日轮换，50,000 月度目标当前使用“有效访客天数”作为隐私保护代理值，不冒充跨 28 天完全去重的月 UV，也不再把所有页面请求当成合格流量。部署日志、行动账本、技术巡检和经营报告目录权限均为 `700`，文件权限为 `600`，且没有任何面向访客的展示页面。

Core Web Vitals 通过 Next.js `useReportWebVitals` 在真实浏览器上采集，只保留 LCP、INP、CLS 数值与当日匿名访客哈希，不保存设备指纹或原始 IP，并与其他站内统计一样尊重 DNT、过滤机器人。私有报告采用第 75 百分位：LCP 良好阈值为 2.5 秒、INP 为 200 毫秒、CLS 为 0.1；单项至少 10 个样本才生成性能优化建议，避免小样本误判。

## GitHub Secrets

在仓库的 `production` Environment 中配置：

- `ECS_HOST`：ECS 公网 IP 或主机名。
- `ECS_USER`：当前可先使用 `root`；稳定后应改成仅能管理本站目录和 PM2 应用的部署用户。
- `ECS_PORT`：SSH 端口，通常为 `22`。
- `ECS_SSH_KEY`：部署专用私钥。不要直接复用个人日常登录私钥。
- `ECS_KNOWN_HOSTS`：运行 `ssh-keyscan -H <ECS_HOST>` 得到的完整主机公钥记录，用于阻止中间人攻击。
- 公众号 RSS 服务固定监听 ECS `127.0.0.1:8001`，Feed ID 为 `MP_WXS_3212677307`。同步任务复用 ECS SSH Secrets，不需要公网 RSS 地址。

## ECS 公众号 RSS 服务

- 容器：`we-mp-rss`，重启策略 `unless-stopped`。
- 数据：`/opt/we-mp-rss/data`，应纳入 ECS 数据备份。
- 管理端：仅 `127.0.0.1:8001`，需要时使用 SSH 本地转发，禁止直接开放安全组或 Nginx 公网入口。
- 管理密码：随机密码只保存在 ECS `/opt/we-mp-rss/admin-password`，权限为 `600`。
- 当前公众号：`芝士AI吃鱼`，Feed ID `MP_WXS_3212677307`。
- 微信授权 Token 有有效期；失效后通过 SSH 隧道进入授权管理重新扫码。

同步工作流会先登录内网管理 API、检查微信扫码授权，再调用 `/api/v1/wx/mps/update/<feed-id>` 采集最多 5 页历史文章，并轮询 RSS。不要用 Feed 的 `is_update=true` 代替采集接口；该参数只刷新数据库中的 RSS 输出，不会主动抓取公众号。授权失效时任务会明确失败并要求重新扫码。

微信可能返回 `200013` 频率控制。自动任务每天只触发一次更新，不应循环重试；频控期间 RSS 会保留已有内容，待限制解除后再补采集。

## AI 日更草稿

本地模型服务使用 OpenAI 兼容的 Chat Completions 接口。密钥只通过环境变量传入，不得提交到 Git：

```bash
CONTENT_AI_BASE_URL=http://127.0.0.1:3000/v1 \
CONTENT_AI_API_KEY='本地服务 auth-key' \
CONTENT_AI_MODEL=auto \
npm run draft:daily
```

可选参数：

- `CONTENT_TOPIC`：指定本期选题；未指定时只生成常青技术内容。
- `CONTENT_WEB_SEARCH=true`：允许兼容后端调用网页搜索；开启后仍需人工核对每个来源。
- `CONTENT_DATE=YYYY-MM-DD`：指定草稿日期，主要用于补稿与测试。
- `CONTENT_FORCE=true`：允许同一天再次生成；默认会跳过，避免重复和批量滥用。
- `CONTENT_MAX_REPAIR_ATTEMPTS=1..4`：结构化质检失败后的定向返工上限，默认 3；每轮会携带当前失败原因与历史原因，仍不合格则停止发布。

生成文件位于 `content/posts/daily-*.mdx`，默认 `published: false`。当前 `chatgpt2api` 属于逆向兼容实现，应遵守其使用限制；只允许低频、个人、人工审核的草稿生成，不得批量调用或自动直发。

## 每日深度文章与双端发布

`npm run article:daily` 是新的深度文章生成入口。它每天只生成一篇，围绕“AI 原生一代、AI 与学习/工作/关系/创造”等常青议题，输出：

- 网站 MDX：`content/posts/daily-*.mdx`；
- 公众号富文本：`content/wechat/daily-*.html`；
- 公众号发布清单：`content/wechat/daily-*.json`；
- 统一海军蓝信息图：`public/images/articles/<日期-主题>/`。

生成过程包含写作、主编审校和失败返工。发布阈值包括：正文长度、章节数量、来源数量、四张信息图、危险标签与模板化罗列检查。内容方法参考 `docs/ai_cognitive_outsourcing_wechat.html`，但禁止逐句仿写、虚构作者经历或用随机插画代替信息图。

公众号发布状态使用“文章日期 + 主题 slug”作为幂等键，避免不同日期重复选题时误把旧草稿当成当天稿件；旧草稿不会被自动删除。

本机每日任务由 `scripts/run-daily-content.sh` 执行：先从本机 `chatgpt2api` 生成并通过生产构建，再创建 PR、等待 CI、合并并等待 ECS 健康提交号一致，最后才调用公众号接口。安装 macOS 08:30 定时任务：

GitHub 写操作如果发生超时，流水线会用 PR 的 head/base 和合并提交号对账远端状态：已经创建或合并则从断点继续，远端状态仍未确认才停止。该恢复逻辑不会绕过失败的 CI，也不会在未知状态下发布公众号内容。

```bash
npm run schedule:daily:install
```

公众号主动发布使用微信官方 `draft/add` 和 `freepublish/submit` 接口。AppID/AppSecret 保存在 macOS 钥匙串和 ECS `/root/.config/ai-knowledgepoints/publisher.env`，不得写入仓库；ECS 出口 IP `8.149.232.39` 必须加入公众号 IP 白名单。发布图片先上传微信素材接口，再用微信返回 URL 替换正文图片。

由于 `chatgpt2api` 是逆向兼容实现，本任务保持每天最多一篇、串行执行、失败不重试发布、不做批量补发。若服务条款或账号状态变化，应立即停用 LaunchAgent。

## ECS 环境变量

生产 `.env.local` 除原有后台与 OpenRouter 配置外，建议增加：

```env
ANALYTICS_DATA_DIR=/root/self-web-host-data
ANALYTICS_HASH_SALT=至少32位随机字符串
NEXT_PUBLIC_GA_ID=G-LH50LSN47W
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
NEXT_PUBLIC_BAIDU_SITE_VERIFICATION=
```

统计只保存按天哈希后的访客指纹，不保存原始 IP，也不建立跨日用户标识。回访只由浏览器上报“此前日期访问过”的布尔信号；DNT、常见机器人和监控 User-Agent 不计数，单个每日指纹最多计入 100 PV，降低自动流量污染。数据默认保留 400 天。`ANALYTICS_DATA_DIR` 目录权限固定为 `700`，数据文件固定为 `600`，备份时需要同时备份该目录。

## 发布权限

- 自动执行：构建、健康检查、Sitemap/RSS/结构化数据、公众号草稿同步。
- PR 审核：新文章、首页文案、作者信息、导航和栏目调整。
- 禁止自动化：DNS、ECS 安全组、SSH 密钥轮换、删除文章或统计数据。
