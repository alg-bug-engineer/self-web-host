# R01｜第一周监护人卡点研究执行包（内部）

## 状态与用途

- 到期：2026-08-13
- 状态：待在 NotebookLM 可见网页中执行
- 目标输出：`content/campaigns/ai-native-generation-30d/2026-08-13-notebooklm-week1-objection-review.md`
- 编辑去向：8 月 16 日知识星球答疑、8 月 18 日公众号、第一周复盘
- 本文件只定义研究问题、来源白名单和验收边界，不包含研究结论，也不得直接公开。

## 只允许使用的四个来源

| ID | 机构 | 来源 | 本轮用途 |
|---|---|---|---|
| S02 | NIST | [AI RMF: Generative Artificial Intelligence Profile (AI 600-1)](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) | 生成式 AI 风险、测量、验证和人工监督 |
| S03 | UNESCO | [AI competency framework for students](https://www.unesco.org/en/articles/ai-competency-framework-students) | 学生 AI 能力维度与进阶理解 |
| S04 | UNESCO | [Guidance for generative AI in education and research](https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research) | 人本、年龄适宜、隐私和教育场景验证 |
| S05 | UNICEF | [Guidance on AI and children, Version 3.0](https://www.unicef.org/innocenti/reports/policy-guidance-ai-children) | 儿童安全、隐私、透明、问责和能力准备 |

NotebookLM 若无法把某条回答引用到这四项中的具体段落，必须写“当前限定来源未支持”，不能调用模型记忆、搜索摘要或其他网页补齐。

## 复制到 NotebookLM 的研究指令

```text
只使用当前笔记本中与 S02 NIST AI 600-1、S03 UNESCO 学生 AI 能力框架、S04 UNESCO 生成式 AI 教育与研究指南、S05 UNICEF 第 3 版儿童 AI 指引相对应的来源。

研究目的不是证明课程有效，也不是虚构家长反馈，而是为第一周答疑建立“来源支持—课程假设—真实任务待验证”的边界。

围绕以下三个主题分别整理 3 个“监护人可能提出的问题模式”，共 9 个：
1. 输入与输出：家庭怎样理解系统实际获得了什么、输出了什么、最后由谁检查；
2. 生成与查证：语言流畅、链接存在或回答稳定，为什么仍不能直接当作已查证；
3. 流畅错误：怎样把“AI 可能出错”改成可观察、可复查、可由真人承担责任的问题。

不得生成虚构家长引语。不要把问题写成引号内的真实家长原话，也不要声称这些问题常见、高频或已被家庭数据证实。

每个问题必须输出六列：
- 问题模式；
- 来源支持到什么程度；
- 对应来源 ID 与可定位引用；
- 本课程暂定教学支架；
- 仍需真实家庭任务验证什么；
- 不能推出的结论。

把“家庭 AI 足迹、同一问题三次回答、错误侦探卡”明确标成课程自研支架，不得称为 NIST、UNESCO 或 UNICEF 标准。

最后单列：
A. 当前四项来源没有回答的问题；
B. 8 月 16 日答疑可以安全转述的原则；
C. 必须等待知识星球真实任务数据后才能讨论的卡点；
D. 任何涉及儿童姓名、学校、位置、正脸、声音、聊天、健康或原始作品的材料一律不得请求、导入或保存。

每个事实性句子必须有 NotebookLM 可见引用；没有引用时写“仍未知”，不要补写。
```

## 结果文件结构

执行后只把通过核验的内容整理到目标输出文件，并保留以下结构：

1. `研究范围与来源`：列出 S02—S05，不增加其他来源；
2. `九个问题模式`：三类各三个，使用六列表格；
3. `来源支持的原则`：逐条带原始来源链接；
4. `课程教学假设`：家庭 AI 足迹、三次回答实验、错误侦探卡单独列出；
5. `仍未知与验证动作`：只写需要从去重聚合任务数据观察的项目；
6. `编辑承接`：分别给 8 月 16 日、8 月 18 日和周复盘一个可用角度；
7. `禁止公开的推断`：效果、频率、排名、诊断、真实引语和未获证据的因果关系。

## 保存前验收

- [ ] 只出现 S02、S03、S04、S05 四个来源；
- [ ] 9 个问题均为“问题模式”，没有虚构引语或频率判断；
- [ ] 每行都区分来源支持、课程假设、待验证部分和禁止结论；
- [ ] 家庭 AI 足迹、三次回答实验、错误侦探卡未被写成机构标准；
- [ ] 没有成绩、升学、竞赛、智力、心理改善或课程有效性承诺；
- [ ] 没有儿童身份、学校、位置、脸部、声音、聊天、健康或原始作品；
- [ ] 公开可用事实均能回到原始机构页面，而不是 NotebookLM 回答本身；
- [ ] 无法支持的内容明确保留为“仍未知”。

## 独立 CLI profile

活动专用本地 profile 已创建为 `ai-native-generation`，没有切换全局默认 profile，也没有读取现有 Chrome Cookie。只读检查命令：

```bash
notebooklm -p ai-native-generation auth check --test --passive --json
```

当前 profile 尚未登录。如需启用 CLI，只能由作者在可见新窗口中手动完成一次独立登录：

```bash
notebooklm -p ai-native-generation login --browser chrome
```

不得使用 `--browser-cookies`、`auth import-cookies`、`--storage` 指向现有浏览器数据，也不得复制 cookies、localStorage、密码或会话数据库。登录成功后运行 `npm run campaign:notebooklm:bootstrap`；脚本会显式使用该 profile，不污染默认 NotebookLM 会话。

## 执行门禁

当前 CLI 认证仍为 `pending`。若到期前没有完成上述独立登录，只允许在已核验的 NotebookLM 可见网页中执行；不得读取、导出或复用 Chrome Cookie、localStorage、密码或会话数据库。保存笔记不等于公开发布，输出文件还要经过原始来源复核和编辑验收。

完成目标输出并逐条人工核验引用与隐私边界后，先运行以下命令检查；去掉 `--apply` 即为默认 dry-run：

```bash
node scripts/record-campaign-research-task.mjs --task R01 --completed-at <ISO> --verified-source S02 --verified-source S03 --verified-source S04 --verified-source S05 --source-citations-verified --privacy-verified --apply
```

登记器不会操作 NotebookLM 或公开平台。目标文件不存在、少任一原始来源链接、结构不完整、时间早于到期日，或缺少两个人工核验开关时，都不得把任务改为 `completed_verified`。
