# 为儿童 AI 项目建立双门安全模型：Data Minimization 与 Publication Gate

生成式 AI 进入家庭项目以后，常见安全设计仍停留在一组禁止词：不要输入姓名，不要上传隐私，不要传播假消息。问题在于，真实项目不会按风险类别排队出现。孩子拍下一页作业，请模型整理；家长把生成插画放进展示稿；作品准备发布时，又同时出现身份、版权、事实和生成标识问题。

与其把安全做成课尾提醒，不如把它实现成两道状态门：输入 AI 前的 `Input Gate`，以及对外发布前的 `Publication Gate`。

## 一、风险对象不是单字段，而是可组合线索

删除姓名并不自动完成匿名化。一张作业照片还可能包含校服、班级、编号、正脸、声音、窗外位置、拍摄时间、设备元数据；多项普通线索组合后，仍可能指向具体儿童。

《个人信息保护法》第二十八条将不满十四周岁未成年人的个人信息列为敏感个人信息；第三十一条要求处理此类信息时取得父母或其他监护人同意，并制定专门处理规则。对产品来说，这是合规要求；对家庭任务来说，第一步应更早：如果任务不需要这项信息，就不要处理。

因此，输入门首先执行 data minimization，而不是先问“有没有同意”。

```text
candidate input
  -> purpose necessary?
  -> owned or appropriately authorized?
  -> identifying or sensitive when combined?
  -> can redact / aggregate / substitute / fabricate safely?
  -> allow minimal input | stop
```

四个检查字段可以写成：

```ts
type InputDecision = {
  purpose: string
  necessary: boolean
  ownership: 'self' | 'authorized' | 'unknown'
  sensitivity: 'ordinary' | 'identifying' | 'sensitive'
  transformation: 'none' | 'redact' | 'aggregate' | 'substitute'
  state: 'allow_minimal' | 'revise_input' | 'stop'
}
```

`consent=true` 不能把 `necessary=false` 自动改成可上传；一次授权也不能无限扩展到新的目的、平台、范围和时间。

## 二、输入安全不等于发布安全

模型只收到普通数据，输出仍可能包含错误事实、无授权素材、未标识的生成内容，或者足以伤害真实关系的冒充与定位信息。因此发布门必须独立存在。

```text
AI-assisted artifact
  -> factual claims verified?
  -> source and license traceable?
  -> synthetic content declared and labels preserved?
  -> privacy and foreseeable harm reviewed?
  -> internal_only | revise_before_share | do_not_publish
```

这里不建议使用简单的 `approved: boolean`。三态决策更适合家庭项目：

- `internal_only`：只在家庭设备内使用，不外发；
- `revise_before_share`：完成具体删除、替换、核验或标识后再分享；
- `do_not_publish`：停止发布，不把“必须产出”置于安全之上。

## 三、把来源与标识做成可追溯字段

《人工智能生成合成内容标识办法》把文本、图片、音频、视频和虚拟场景纳入生成合成内容，并区分显式、隐式标识。其第十条要求用户发布生成合成内容时主动声明，并使用服务提供者的标识功能；第十一条禁止恶意删除、篡改、伪造或隐匿相关标识。该办法自 2025 年 9 月 1 日起施行。

家庭项目不需要自建复杂水印系统，但应保留三类信息：

```text
artifact_id
source_or_generator
license_or_permission
ai_assistance_scope
platform_disclosure_used
label_preserved
human_owner
```

生成插画不能被标成实验照片，模型改写不能被标成外部来源。对“课程作业”“家庭观察”和“AI 辅助”分别标记，能减少展示层覆盖证据来源。

## 四、双门状态机

可以把一次项目发布建模为以下状态：

```text
DRAFT
  -> INPUT_REVIEW
  -> SAFE_TO_PROCESS
  -> OUTPUT_REVIEW
  -> INTERNAL_ONLY | REVISE | READY_TO_SHARE | STOPPED
```

每次状态迁移都留下 `reason`、`owner` 和 `checked_at`。不要保存儿童原始材料来证明审核发生过；保存去标识化决策摘要即可。

```json
{
  "artifact": "paper-bridge-summary",
  "input": {
    "state": "allow_minimal",
    "removed": ["name", "photo", "location"],
    "substituted": ["raw image -> numeric observations"]
  },
  "publication": {
    "state": "revise_before_share",
    "requiredActions": ["verify claim 2", "declare generated illustration"]
  }
}
```

## 五、验收标准

双门安全模型是否有效，不看家庭背出了多少法律术语，而看能否完成五个动作：

1. 发现姓名之外的组合识别线索；
2. 把“上传整页”改为只输入完成任务所需的最小内容；
3. 区分事实来源、生成内容和人工判断；
4. 发布时使用平台声明并保留标识；
5. 在风险无法消除时选择不发布。

对于儿童 AI 项目，`do_not_publish` 不是失败状态，而是正常、可审计的安全结论。

本文用于家庭 AI 素养与产品安全设计讨论，不构成法律意见。具体处理活动应以现行法律、主管部门文件和平台规则为准。

如果你是监护人，并希望登记四周儿童 AI 素养课程内测，可到公众号“芝士AI吃鱼”私信 `儿童AI内测-CSDN`，只发送年龄段（8—10 / 11—12 / 13—14）、每周共同投入（少于 30 / 30—60 / 60—90 分钟）和参与偏好（异步任务 / 集中答疑 / 两者都可）。当前只登记、不收费，也不代表录取；不要发送儿童姓名、学校、位置、账号、照片、声音、聊天、健康情况或原始作品。

## 官方资料

- 《中华人民共和国个人信息保护法》：https://www.npc.gov.cn/WZWSREL25wYy9jMi9jMzA4MzQvMjAyMTA4L3QyMDIxMDgyMF8zMTMwODguaHRtbD9yZWY9aW1i
- 《人工智能生成合成内容标识办法》：https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm
