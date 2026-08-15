# AI 原生一代课程上线决策报告

- 检查时间：2026-08-11 22:35（Asia/Shanghai）
- 检查范围：课程页运行时源码、交互与归因代码、发布验收文件、L01—L12 视频、SRT/WebVTT 字幕、课程海报、渠道链接、付费门禁与生产 URL
- 当前决策：**不可上线（preflight only）**
- 本轮操作：未提交、未推送、未部署、未启用渠道链接

## 已通过

- Next.js 生产构建通过，构建产物包含 `/ai-native-generation` 路由。
- L01—L12 共 12 个 MP4 均包含 H.264 视频、AAC 音频和中文 `mov_text` 内嵌字幕。
- 12 份 SRT 与 12 份 WebVTT 均存在，页面引用完整。
- 12 张课程海报均为 WebP，长宽不超过 1280px，总大小 0.76 MiB。
- 课程页需要的 49 个静态资产全部存在，共 187.51 MiB；没有单文件达到 100 MiB。
- 12 个必需运行时源码文件全部存在，6 个发布验收文件全部存在；部署审计现在分别检查源码和媒体，不再只检查静态资产。
- 公开承诺策略、渠道链接规则、课程内测付款门禁和部署审计测试通过。
- 课程内测仍为 `intake_only`，未开放付款。
- 渠道链接仍为 `hold_until_course_page_public`，没有把 404 页面传播到外部平台。

## 阻断项

1. 尚未收到本轮网站部署的明确授权，配置保持 `deploymentAuthorized: false`。
2. 工作区存在 56 项改动；现有部署脚本遇到脏工作区会停止。
3. 49 个课程必需静态资产均尚未被 Git 跟踪，当前生产部署无法携带这些文件。
4. 12 个必需运行时源码文件中只有 7 个已跟踪；课程页、试听组件、自测组件、监护人调研组件和调研定义共 5 个尚未跟踪。
5. 6 个发布验收文件中只有 4 个已跟踪；课程渠道链接和课程媒体验收测试共 2 个尚未跟踪。
6. 生产课程页 `https://ai-knowledgepoints.cn/ai-native-generation` 当前返回 HTTP 404，而已发布常青母文和 sitemap 均返回 HTTP 200；上线标准仍为课程页 200。

生产 404 是未部署的结果，不应通过降低检查标准来消除；授权、变更范围审查、源码与媒体版本化完成并部署后，再核验生产状态。

## 获得授权后的执行顺序

1. 只审查并纳入本活动所需运行时源码、验收测试、内容和 49 个静态资产，继续排除本地即梦原始候选图和 `docs/著作.jpeg`。
2. 重新运行课程媒体、公开承诺、渠道链接、付款门禁、部署审计与生产构建测试。
3. 按现有部署流程提交、推送并部署经过审查的版本。
4. 验证课程页 HTTP 200 和 canonical；验证 12 个视频支持 Range 206、12 份 WebVTT 与 12 张海报返回 200。
5. 在生产环境走通家庭自测、监护人匿名调研、试听、星球点击和监护人意向事件，并核对健康接口 commit。
6. 只有全部生产核验通过后，才把渠道链接状态从 `hold_until_course_page_public` 改为 `active`。

## 可重复检查

```bash
npm run test:course-video
npm run test:campaign-deploy-audit
npm run test:public-claims
npm run test:campaign-tracking
npm run test:paid-pilot
npm run build
npm run campaign:deploy:audit -- --production
```

部署审计为只读命令，不执行提交、推送、部署或外部发布。
