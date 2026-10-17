# Agent 可靠执行实战（九）：金额预留与最终账单

独立可运行的 Python 标准库教学实验。全部金额为合成 USD 美分，全部账单为可信测试夹具；没有网络、模型、Composio SDK、真实扣款或生产支付集成。

## 复现

将 budget.py、test_budget.py、run_experiment.py、results.json、README.md 放到同一空目录，Python >=3.10：

    python3 test_budget.py
    python3 run_experiment.py --check
    python3 run_experiment.py --output reproduced.json

验证环境 Linux / Python 3.12.14 / SQLite 3.53.1：34 tests、12 scenarios。使用真实 SQLite WAL、独立进程和六个 os._exit(73) 故障点；并发准入用8个进程共同 Barrier，不依赖sleep排序。超时是防挂死看门狗，不是性能数据。未测Windows、断电、网络或集群。

## 协议

一个数据库就是一个预算范围。cap 不因重启重置。整数美分避免浮点；真实更细单位不能直接向下取整。上界必须由可信执行器确定，不能来自模型估计；本例不验证报价或授权。

reserve 原子检查已结算费用加未结算全额上界，写 reserved。claim 检查工具、参数、最大金额、报价标识与固定USD币种的摘要，单次改为 unknown，提交后返回参数快照。可信适配器至多派发一次；样例不发送外部调用，无法控制隐藏SDK重试或绕过入口。

reconcile 仅接受可信校验器提供的完整最终不可变账单，把 unknown 改为 settled，以最终费用替换上界。证据ID只用于去重，不认证账单。缺账单/超时不释放，reserved不可直接零元退款。重复同账单不再次释放，变更/跨操作证据复用拒绝。

超过上界仍记录真实费用并冻结新准入/领取；不能撤回已领取派发或逆转外部账单。本地 exposure 可超过 cap，恰好表明供应商遵守上界的前提被破坏。冻结后仍可对账，不能自动解冻。

## 边界

安全结论依赖可信上界、唯一受控收费入口、单次派发、账单最终性与身份验证。代码没有这些外围集成，也不提供授权接口、支付能力、报价到期检查、退款、分批计费、补账版本、多币种、多租户隔离、跨库全局限额或自动取消释放。

run_experiment 中 unsafe_check_then_spend 是确定性合成错误交错算例；其余场景执行本地数据库协议。results 不保存非确定性的并发赢家ID，只保存计数和总占用。不把实验解释为供应商限额实测。

来源（2026-10-17核对）：
- https://docs.composio.dev/docs/instant-tools
- https://www.sqlite.org/lang_transaction.html
- https://www.sqlite.org/pragma.html#pragma_synchronous

AI辅助制作，实验代码与合成数据供检查与复现。
