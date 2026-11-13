# 知识宇宙发布

公开入口为 `/planet/universe/index.html`，从主站首页和 `/planet` 可进入。

本目录中的发布副本来自用户提供的「知识宇宙-3D核心引擎」。仅发布 index、engine、levels、universe-data、episode-bridge、css 和 lib；不发布 `.backup-*`、设计文档、种子源码、音频制作材料或凭据。

部署适配包括：

- 正片 iframe 使用 `/planet/series/01.html` 至 `20.html`。
- `/planet/episode-contract.js` 由课程在 iframe 中加载，播放消息只在同源外壳与对应 iframe 之间传递；收听门槛沿用引擎现有规则。
- Three.js 与 OrbitControls 使用随包提供的本地版本，资源 URL 带发布版本；不从 CDN 回退加载。
- `site.css`、`site.js` 提供主站返回链接适配、复制/打印限制和隐藏面板的视口边界修正。

游戏进度、资源、掌握度和已看正片列表沿用当前引擎的浏览器本地存档，不提供账号或跨设备同步。课程浏览、点赞、分享统计继续使用现有服务器 SQLite，与游戏存档分开。

更新时保留用户原始项目和种子不变，只修改站点仓库中的发布副本。通过 GitHub main 和 `bash scripts/deploy.sh origin/main` 发布，不在 ECS 手改源码。

验证：生产构建、`knowledge-universe.spec.ts`、原有导航/课程回归测试；上线后复查健康版本、首页进入宇宙、生命树进入正片、播放控制、返回主站、桌面与移动端画面。
