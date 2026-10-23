# Agent 可靠执行 15：工作流版本绑定

独立的 Python 标准库 / SQLite 教学模型。业务为合成积分；真实运行的是数据库事务、操作系统子进程退出及并发竞争。没有模型、网络、远端工具或真实资金。

## 复现

把 versioned.py、test_versioned.py、run_experiment.py、results.json、audit_invariants.py、README.md 放在同一空目录。Python 3.10+，无需安装第三方包。

```sh
python3 test_versioned.py
python3 run_experiment.py --check
python3 audit_invariants.py
```

预期 21 tests / OK，PASS: 10 scenario groups match results.json。实验使用并清理临时目录；不要改成真实数据库路径。run_experiment.py 不带 --check 会重新生成 results.json，不要靠更新基线掩盖测试失败。

独立审计额外实际运行 50 seeds × 500 混合操作、40 轮 × 12 个 READY 门控进程竞争及清单破坏拒绝检查，对应三行 PASS。检查受理绑定、效果/游标与迁移审计链，不是生产性能或恶意管理员防护证明。

## 协议

- register：内容寻址、不可变的规范化 JSON 定义，支持 local-ledger/1 ABI。改变步骤顺序或参数获得新摘要。
- switch：CAS 更新新任务默认，route revision 单调增加；不修改已有任务。
- admit：原身份先查重，原输入 replay，异输入 conflict；新身份在同一事务绑定默认。
- claim：只领取当前绑定在本地能力清单内的 ready 任务；返回 id、绑定版本、generation、cursor、摘要。
- step：复核 token / 能力 / 清单字节，效果与游标同事务提交。
- recover：可信本地人工恢复 inflight，要求匹配 generation，并使旧代次失效。没有自动超时回收。
- migrate：可信调用者明确改变语义；仅 ready 且 cursor=0，审计与绑定同事务；保留 accepted_digest、输入与身份。它不是兼容证明，也不授予权限。
- snapshot：读事务内的一致快照；结束后可能过期。unfinished_by_definition 包含 ready 和 inflight。

V1 为 base(units)、bonus(1)；V2 为 bonus(3)、base(units)。输入10时分别为11和13。错误地用V2清单解释V1的下一步游标，会产生20；这是显式构造的错误算法，不是生产事故。

## 证据与边界

21 项测试中包含 10 组完整实验。12 个真实退出边界涵盖受理前后、领取前后、效果插入后、步骤提交前后、路由提交前后、迁移审计插入后和迁移提交前后。退出采用 os._exit(73)，父进程验证退出码；不是断电测试。

并发使用 READY/GO 握手；赢家不固定，仅验证完整绑定、单次有效领取、CAS、效果与审计一致等性质。--check 会重做实验，不只是读旧结果。

所有效果与进度同库提交，是本例恢复和迁移边界成立的必要条件。ready/cursor=0 表示尚无已提交步骤，不表示从未领取或从未启动；曾领取后显式恢复仍可能允许迁移。远端副作用不能凭本地cursor判断是否发生，未知结果不适用本例恢复策略。

摘要只标识清单，不证明Python实现、模型、外部工具或新运行制品行为等价。能力清单由可信本地代码声明，不提供认证/制品证明。无部分执行状态转换、清理/TTL、授权、分布式锁、远端exactly-once、事件历史重放、负载公平性或最终完成保证。未完成计数不是删除旧制品的唯一条件。

官方依据：
- https://www.sqlite.org/lang_transaction.html
- https://docs.temporal.io/worker-versioning
- https://docs.aws.amazon.com/step-functions/latest/dg/concepts-state-machine-version.html

核对日期：2026-10-23。本文实现不是这些云/工作流产品的集成测试。
