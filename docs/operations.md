# 网站自动运营基线

## 当前闭环

1. 页面访问同时进入 GA4 与站内隐私化计数，文章页展示累计阅读，首页周榜使用最近 7 天真实数据；私有后台另统计每日回访信号、有效阅读、50%/90% 阅读深度、页面平均投入时间、LCP/INP/CLS 的真实用户第 75 百分位，以及著作、项目、GitHub、知识星球和工具入口的价值转化率。
2. `/api/health` 提供部署提交、进程存活时间和已发布文章数。
3. `main` 分支更新后，GitHub Actions 先构建，再登录 ECS 执行候选构建、PM2 reload 和线上健康检查；失败时恢复上一份 `.next`。
4. 每小时从 GitHub 检查首页与健康接口。
5. 每日私有经营任务先巡检 Sitemap、canonical、noindex、JSON-LD、RSS、robots、`llms.txt`、内部链接、安全响应头与作者公开资料，再评估部署行动，最后把技术异常、流量质量与学习结果合并进经营报告。
6. ECS 内网运行 We-MP-RSS；每日 GitHub Action 通过 SSH 读取回环地址上的 RSS，只接收本人公众号最近 31 天已公开文章，经账号、时间、篇数、正文长度、lint 与生产构建校验后创建 PR、自动合并并显式触发部署；管理后台始终不公开。
7. 自动化发布与监控只在服务器、GitHub Actions 和内部日志中运行，不提供面向访客的运维页面。
8. 本地 `chatgpt2api` 每天最多生成一篇深度文章；模型输出必须经过历史选题轮换、标题/摘要/标签/正文相似度检查、写作、主编复核、定向返工、结构与危险标签校验、lint、生产构建和 PR 留痕，全部通过后才在已批准的日更范围内自动发布。
9. 文章索引页按“模型与原理、Agent 与实践、AI 与人”组织可重叠的主题入口，并提供三条人工策划的起始阅读路径；路径与筛选点击进入私有价值统计和 GA4 自定义事件。新增日更文章继续依靠标签自动进入对应栏目，不要求生成器维护一套容易失真的独立分类。
10. 每次生产部署和公网健康检查通过后，IndexNow 根据 Git 变更只映射受影响的公开页面，并通知 Bing、Copilot 等参与该协议的搜索服务；后台、API、站内搜索和纯内部文件永不提交。全站布局或验证配置变化时才读取 Sitemap 做一次全量通知，通知失败只告警，不回滚已健康的生产版本。
11. 每日私有经营任务还会生成 `content-latest.json`：检查上海时区当天是否日更、近 7 天发布节奏、最新文章与历史文章的重复信号、公众号清单与草稿/群发状态、We-MP-RSS 连通性、扫码授权和 Feed 条数。报告只保留状态和低敏摘要，不写入 access token、管理密码、草稿 media id、内容哈希或 AppSecret。
12. 有效阅读秒数只在页面可见且浏览器窗口聚焦时累计，后台标签页不再被误判为阅读。私有经营报告按页面汇总访客天、有效访客天、阅读深度、活跃阅读时间和价值转化；自然数据未达到 7 个活跃日且 20 个访客天时，决策固定为观察，不根据早期噪声自动修改标题、内容或 UI。Search Console 达到 100 次曝光时可作为独立的搜索实验依据。
13. CI 使用 Playwright 在桌面与移动端验证首页、最新日更文章、作品页和公开边界。检查包含横向溢出、菜单键盘交互、图片可用性、外链安全属性，以及 `/operator`、`/ai-operator` 持续返回 404；本地运行 `npm run build && npm run test:ui`。
14. 站内统计只接受 `ops/public-analytics-paths.json` 声明的公开页面和 Contentlayer 中已发布文章；404、后台、API 与运维探测路径不进入 PV、访客天、来源或经营决策。历史报告也会过滤这些非公开路径，避免健康检查本身制造增长信号。
15. 个人公开数据集中保存在 `src/data/profile.json`。每日私有任务通过 GitHub 公开 API 核对品牌名、作者链接和公开仓库数；出现漂移时只生成 `profile-review` 审查事项，不自动修改学历、工作经历、著作或公众号读者数。GitHub 单次不可用时保留现值并等待次日，不把网络故障当成资料变化。
16. 价值转化只记录白名单内的站内入口与匿名访客，例如查看著作、访问项目、RSS 订阅和点击放大公众号二维码。服务端要求同一匿名访客当天已访问对应公开页面，才接受该页转化；未访问页面的直接 API 请求不会污染经营报告，也不保存账号、原始 IP 或任意外链地址。
17. 每篇已发布文章同时提供 `${文章 URL}/index.html.md` 的干净 Markdown 版本；HTML 通过 `rel=alternate` 声明，`llms.txt` 直接链接这些机器可读正文。Markdown 保留作者、日期、主题、正文与 HTML canonical，不进入 sitemap 以避免制造重复索引页。每日技术巡检逐篇验证状态码、内容类型、canonical、正文结构和 MDX 展示标签清理结果。
18. 文章页始终显示基于正文区域计算的阅读进度；具备至少两个标准二级标题的文章会在正文前输出可键盘访问的目录。目录 ID 使用与 `rehype-slug` 相同的 GitHub slug 规则，标题设置滚动偏移，桌面与移动端均验证目录链接实际指向页面标题。旧文若只有加粗段落而没有语义标题，不伪造章节结构，只显示阅读进度。
19. 公众号入站同步使用私有状态文件 `/opt/we-mp-rss/sync-state.json` 防止空库反复触发微信列表接口。一次采集完成后仍为 0 篇时，从 48 小时开始指数退避、最长 7 天；退避期内工作流只读取现有 Feed，不发起采集，出现文章后自动清零恢复。采集器只在本次任务时间窗读取容器日志，并把 `200013`、`frequency control` 或服务当前使用的拼写 `frequencey control` 归一为一个布尔频控结果；原始日志不会复制进状态或报告。状态文件仅保存时间、计数和结果，权限为 `600`，不保存登录令牌、Cookie 或文章正文；私有内容运营报告会区分普通空 Feed、保护性退避与微信明确限流。
20. 本机日更不在用户当前工作区生成内容：调度器先 fetch 并以 `origin/main` 是否已有当天文章作为唯一发布判据，再从该提交创建临时 detached worktree，完成依赖安装、生成、构建、提交、PR、部署与公众号交付后自动清理。用户的未提交修改和素材不会被读取、暂存或覆盖；失败发生在推送前，半成品随临时工作区清理；失败发生在推送后，则以确定的每日分支复用原稿并继续 PR/CI/部署，不重复调用模型。10:30、12:30 会在 08:30 之后做两次幂等补偿，远端已经发布时不启动 Docker 或模型。
21. 作者经历与专业成果只写入具有交叉核验来源的信息：公开资料用品牌名连接职业经历，国家知识产权局公开文本用唯一专利号连接大语言模型、多智能体与 Text-to-SQL 成果。同名搜索结果、奖项候选名单和无法排除身份碰撞的资料不自动采用。`/about/index.html.md` 与 `/portfolio/index.html.md` 提供同源 Markdown，著作区域仅保留书名；`llms.txt` 直接发现这两个身份实体页，生产技术巡检持续验证内容类型、来源标识和 canonical。
22. 部署留痕与增长实验严格分离：普通代码、内容和运维发布只记录提交，不从流量变化学习胜负；只有通过 commit trailer 声明唯一实验、可验证假设、允许主指标和公开目标路径的审查提交才进入目标页前后窗口。并发上限在决策代码中强制执行，重叠实验标为混杂且不输出归因结论。

经营任务也会尝试读取 Google Search Console 的 finalized 搜索数据：最近 28 天点击、曝光、CTR、平均排名、查询词与落地页。数据固定滞后 3 天，并按 Google 的 `America/Los_Angeles` 日期口径保存到私有 `operator/search-console-latest.json`；凭据缺失或 API 异常只降低报告完整度，不中断站内统计、技术巡检和健康检查。

## 私有经营行动与学习

每次生产部署通过健康检查后，`scripts/record-deployment.mjs` 会把提交号、上一版本、提交主题和最多 100 个变更文件写入：

```text
<ANALYTICS_DATA_DIR>/operator/deployments.jsonl
```

每日 `npm run operator:learn` 将这些部署转换为私有行动记录，但普通发布、运维修复和日更只留痕，不再冒充增长实验。只有经过代码审查、且 squash 提交正文完整声明下列四个 trailer 的部署才进入效果观察：

```text
Operator-Experiment: article-reading-promise
Operator-Hypothesis: 更清楚的首屏承诺会提高目标文章的有效阅读率。
Operator-Primary-Metric: engagementRatePoints
Operator-Target-Path: /blog/example
```

实验标识只能使用小写短横线；假设必须可验证；主指标只能来自站内允许列表；目标必须是公开站内路径，API 与运维路径会被拒绝。系统按目标页面对比部署前 7 个自然日和部署后 7 个完整自然日，只有两侧各至少 5 个数据日才输出信号。主指标低于最小变化阈值时记为混合信号；两个显式实验的观察窗口重叠时记为 `confounded`，不生成胜负结论。`maximumConcurrentExperiments` 会在经营决策层真实阻止并发实验，而不是只作为文档约定。所有结果都只表示前后相关性，不能在没有随机对照时声称因果。行动账本保存在：

```text
<ANALYTICS_DATA_DIR>/operator/actions.json
```

“有效访客”严格定义为：页面可见且窗口聚焦时活跃阅读至少 10 秒、达到 25% 阅读深度或具有回访信号的隐私化访客。站内只把 IP、User-Agent 与语言组合交给服务端 HMAC，原始值不落盘；哈希在同一 UTC 自然月内稳定以支持跨日去重，到下个月自动轮换，无法跨月关联。50,000 月度目标使用该口径的“自然月内去重有效访客估算”，并同时保留访客天作为实验样本门槛。首次从旧的每日哈希迁移时，混合哈希所在自然日被明确排除，不回填或伪造历史月 UV。部署日志、行动账本、技术巡检和经营报告目录权限均为 `700`，文件权限为 `600`，且没有任何面向访客的展示页面。

生产进程启动时会在接收访问前原子迁移统计文件并持久化上述口径边界，不依赖合成流量或首个自然访客。迁移保留全部历史日数据；如果文件不是合法 JSON 或缺少 `days`，新进程拒绝启动并交给部署回滚，绝不以空文件覆盖损坏数据。

Core Web Vitals 通过 Next.js `useReportWebVitals` 在真实浏览器上采集，只保留 LCP、INP、CLS 数值与当月匿名访客哈希，不保存原始 IP，并与其他站内统计一样尊重 DNT、过滤机器人。私有报告采用第 75 百分位：LCP 良好阈值为 2.5 秒、INP 为 200 毫秒、CLS 为 0.1；单项至少 10 个样本才生成性能优化建议，避免小样本误判。

价值转化只接受代码内固定白名单事件，不接收任意事件名或完整外链 URL；目标只保留最多 64 字符的低基数字符串，单访客每天最多 30 次、全站每天最多 50,000 次。转化访客沿用按月轮换的匿名哈希、DNT 与机器人过滤规则，站内私有统计之外只用同名自定义事件同步至 GA4。经营报告会在访客样本足够且转化率低于 5% 时建议一次单入口实验，部署行动学习同时观察转化率点数变化；这些数据绝不展示在公开页面。

## GitHub Secrets

在仓库的 `production` Environment 中配置：

- `ECS_HOST`：ECS 公网 IP 或主机名。
- `ECS_USER`：当前可先使用 `root`；稳定后应改成仅能管理本站目录和 PM2 应用的部署用户。
- `ECS_PORT`：SSH 端口，通常为 `22`。
- `ECS_SSH_KEY`：部署专用私钥。不要直接复用个人日常登录私钥。
- `ECS_KNOWN_HOSTS`：运行 `ssh-keyscan -H <ECS_HOST>` 得到的完整主机公钥记录，用于阻止中间人攻击。
- 公众号 RSS 服务固定监听 ECS `127.0.0.1:8001`，Feed ID 为 `MP_WXS_3212677307`。同步任务复用 ECS SSH Secrets，不需要公网 RSS 地址。

IndexNow 不使用私密凭据。公开 key 与验证文件由 `ops/indexnow.json` 和 `public/<key>.txt` 管理；key 本来就必须能被搜索引擎从站点根目录读取。部署工作流保留前一提交历史，并只在公网健康接口已经返回目标提交号后运行 `npm run seo:indexnow`。文章文件映射到对应 `/blog/<slug>` 和 `/blog`，页面模板变化映射到受影响的文章集合，全局实体或布局变化才提交 Sitemap 中的全部 URL；工作流派发或浅克隆导致提交范围不可读时，安全回退到线上 Sitemap，而不是跳过通知。`npm run test:indexnow` 离线验证域名归属、公开路由白名单、去重、浅克隆回退和验证文件一致性，不向外发送通知。

## ECS 公众号 RSS 服务

- 容器：`we-mp-rss`，重启策略 `unless-stopped`。
- 数据：`/opt/we-mp-rss/data`，应纳入 ECS 数据备份。
- 管理端：仅 `127.0.0.1:8001`，需要时使用 SSH 本地转发，禁止直接开放安全组或 Nginx 公网入口。
- 管理密码：随机密码只保存在 ECS `/opt/we-mp-rss/admin-password`，权限为 `600`。
- 当前公众号：`芝士AI吃鱼`，Feed ID `MP_WXS_3212677307`。
- 微信授权 Token 有有效期；失效后通过 SSH 隧道进入授权管理重新扫码。

同步工作流会先登录内网管理 API、检查微信扫码授权，再调用 `/api/v1/wx/mps/update/<feed-id>` 每天只采集第 1 页并轮询 RSS。导入端固定校验公众号 `biz`、最近 31 天、单次最多 12 篇、正文至少 200 字，并用 `biz + mid + idx` 去重；不批量导入旧档。不要用 Feed 的 `is_update=true` 代替采集接口；该参数只刷新数据库中的 RSS 输出，不会主动抓取公众号。授权失效时任务会明确失败并要求重新扫码。

微信可能返回 `200013` 频率控制。自动任务每天只触发一次更新，不应循环重试；频控期间 RSS 会保留已有内容，待限制解除后再补采集。

当微信授权有效、订阅存在且采集任务正常完成，但 RSS 暂时没有条目时，同步工作流以“新增 0 篇”正常结束，并由私有内容运营报告保留 `wechat-rss-empty` 警告。无效 Feed、授权过期、订阅缺失、采集启动失败或超时仍会让工作流失败，避免把真实故障静默吞掉。

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

`npm run draft:daily` 生成的候选稿默认 `published: false`；生产日更使用 `npm run article:daily`，只允许每天一篇、串行调用，并必须通过主编复核、结构化校验、构建和 PR 记录后发布。当前 `chatgpt2api` 属于逆向兼容实现，应遵守其使用限制，不得批量调用或绕过质量门槛直发。

`npm run operator:content` 是只写私有报告的内容运营巡检，不会触发文章生成、公众号采集或群发。它运行在 ECS 上，以只读方式查询回环地址的 We-MP-RSS；授权有效但 Feed 为空时只记录限制并等待次日单次采集，绝不以循环刷新绕过微信频控。公众号 `freepublish` 返回 48001 时，报告会明确区分“网站已发布、公众号草稿已创建、尚未群发”，不把草稿冒充公开发布。

## 每日深度文章与双端发布

`npm run article:daily` 是新的深度文章生成入口。它每天只生成一篇，围绕“AI 原生一代、AI 与学习/工作/关系/创造”等常青议题，输出：

- 网站 MDX：`content/posts/daily-*.mdx`；
- 公众号富文本：`content/wechat/daily-*.html`；
- 公众号发布清单：`content/wechat/daily-*.json`；
- 统一海军蓝信息图：`public/images/articles/<日期-主题>/`。

生成过程包含写作、主编审校和失败返工。选题目录按学习、工作、创造、社会关系、产品和工程六个主题簇轮换；最近两篇日更所在的主题簇会被降权，已使用的主题标识在目录耗尽前不会重复。不同主题簇使用不同的一手资料池，避免所有文章都套用教育研究。

发布前会读取最多 60 篇历史文章，同时比较 slug、标题、摘要、标签和正文。slug 相同直接阻断；标题相似度超过 52%，标题相似度超过 32%且标签重合超过 40%，或综合相似度超过 42%时也会阻断并交给模型定向返工。最终稿写文件前再次执行同一检查，防止主编审校把新稿改回旧文章。结构阈值还包括正文长度、章节数量、来源数量、四张信息图、危险标签与模板化罗列检查。内容方法参考 `docs/ai_cognitive_outsourcing_wechat.html`，但禁止逐句仿写、虚构作者经历或用随机插画代替信息图。

每篇新日更会在 frontmatter 和公众号发布清单中保存 `topicId` 与 `topicCluster`，用于后续选题记忆；旧文章通过标题、摘要和标签推断主题簇，不需要批量改写历史内容。可用 `npm run test:content-diversity` 对真实历史重复案例、主题轮换和元数据解析做离线回归，不调用内容模型。

公众号发布状态使用“文章日期 + 主题 slug”作为幂等键，避免不同日期重复选题时误把旧草稿当成当天稿件；旧草稿不会被自动删除。

本机每日任务由 `scripts/run-daily-content.sh` 执行：在独立临时 worktree 中调用本机 `chatgpt2api` 生成并通过生产构建，再创建 PR、等待 CI、合并并等待 ECS 健康提交号一致，最后才调用公众号接口。任务每天 08:30 首次执行，10:30、12:30 对失败任务做幂等补偿；已推送的原稿通过确定分支恢复，不重复生成。安装 macOS 定时任务：

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

## Google Search Console 私有数据

1. 在 Google Cloud 项目中启用 Search Console API，并创建只读服务账号凭据。
2. 在 Search Console 的 `sc-domain:ai-knowledgepoints.cn` property 中给该服务账号邮箱授予读取权限。
3. 将 JSON 凭据保存到 ECS `/root/.config/ai-knowledgepoints/google-search-console-service-account.json`，目录权限 `700`、文件权限 `600`；不得写入仓库或 GitHub 日志。
4. 如 property 名不同，用生产环境变量 `SEARCH_CONSOLE_SITE_URL` 覆盖；默认使用 `sc-domain:ai-knowledgepoints.cn`。

采集只请求 `https://www.googleapis.com/auth/webmasters.readonly` 范围。Search Analytics API 只保证返回 Google 保留的顶部数据行，因此报告不得把查询词列表冒充完整搜索日志。

## 发布权限

- 自动执行：构建、健康检查、Sitemap/RSS/结构化数据、本人公众号已公开文章同步、已批准范围内每日一篇深度文章的 PR/CI/部署与公众号草稿写入。
- PR 审核：超出上述范围的新文章、首页文案、作者信息、导航和栏目调整。
- 禁止自动化：DNS、ECS 安全组、SSH 密钥轮换、删除文章或统计数据。
