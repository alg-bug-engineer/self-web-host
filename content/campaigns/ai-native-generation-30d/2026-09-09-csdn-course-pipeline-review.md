# 从生成作品到可验证学习：儿童 AI 素养课程的四阶段流水线复盘

一门生成式 AI 课程如果只验收最终 artifact，模型能力越强，越难判断学习是否真实发生。对于儿童与家庭场景，交付物必须从“成品文件”扩展为一条包含问题、过程、证据、人工决定和安全门的可审计流水线。

这次 30 天试运行采用四阶段结构：理解、协作、验证、责任。它不是四组知识点，而是四个逐步增加证据要求的状态。

## Stage 1：理解——把系统边界显式化

第一阶段不考模型术语，而要求家庭留下三类观察：同一问题多次回答是否变化；一条流畅断言能否回到来源；工具能做什么、不能承担什么。

```text
prompt -> candidate response -> repeated sample -> observed difference
```

验收证据不是“孩子知道 AI 会犯错”，而是一条具体差异和一个仍待核验的断言。

## Stage 2：协作——把任务变成接口契约

第二阶段使用 `background / goal / constraints / checks` 定义问题，再把任务拆成 `action / artifact / verification`。人机分工不按“谁更快”决定，而按能力、授权、核验和责任划分。

```text
problem contract
  -> checkable steps
  -> AI candidate outputs
  -> human accept / reject / modify
  -> owned conclusion
```

如果没有记录采用、拒绝和修改，最终成品无法证明人工判断仍在链路里。

## Stage 3：验证——保护来源与原始记录

第三阶段把长回答拆成 atomic claim，再建立原文、条件、反例和独立来源映射；家庭小研究则将 raw observations 与 model-derived analysis 分离。

```text
claim
  -> source A + evidence span + scope
  -> counterexample candidate
  -> source B + provenance independence
  -> supported | partial | contradicted | unknown
```

```text
question -> method -> append-only observations
         -> anomaly / missing value
         -> AI-assisted analysis
         -> human-checked limited conclusion
```

模型可以生成空表、候选反例和分析草稿，但不能补写未发生的实验数据。`missing` 也不能被转换为 0。

## Stage 4：责任——让发布和退出成为正式状态

第四阶段增加输入门与发布门：

```text
input candidate
  -> necessity / ownership / sensitivity / substitution
  -> allow_minimal | revise | stop

publication candidate
  -> facts / license / synthetic disclosure / foreseeable harm
  -> internal_only | revise_before_share | do_not_publish
```

终课再通过关闭 AI 的答辩检查 agency：孩子能否说明模型哪里可能错、自己完成了什么、证据只支持结论到什么程度。

## 数据模型：不要用曝光填补学习分母

活动复盘至少区分：

```text
content impression
platform read
explicit task start
valid task completion
research log
safety checkpoint
family agreement
closed-AI defense
guardian interest
planet payment
course payment
separately authorized feedback
```

这些状态不可随意互推。跨帖阅读人数不能相加成家庭数；课程意向不是付款；知识星球付费不是课程内测付费；儿童作业上传不是公开案例许可。

完成率只有在存在可靠去重分母时计算。否则报告绝对数和“不可计算”，比生成一个看似完整的比例更可信。

## 月末决策状态

复盘工具把决策分为四类：

- `continue_and_scale`：激活、连续完成、付费和反馈证据同时出现；
- `continue_with_funnel_repair`：已有家庭行动，但在某一转化阶段明显掉队；
- `insufficient_evidence`：主要只有内容供给或曝光，关键入口仍受门禁限制；
- `stop_or_redesign`：入口可用且执行充分，仍没有可重复的激活与产品证据。

门禁本身也必须进入结果。课程页未公开时，不能把“无课程页访问”解释为用户没有需求；付款要素未确认时，不能把“无课程付费”解释为定价失败。

儿童 AI 素养课程真正要优化的，不是让模型生成得更像人，而是让问题、证据、人工取舍、安全判断和现实责任在任何工具变化后仍然可见。

