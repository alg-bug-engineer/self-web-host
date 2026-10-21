# Agent 可靠执行实战 1：副作用成功，确认丢了怎么办？

这是一个**真实执行本地合成工单操作**的故障实验。没有模型调用、网络请求、支付、真实用户数据或生产服务；不测模型成功率，也不提供性能基准。

核心结果：接收端已经提交工单，但回包尚未发出就退出时，普通重试产生 **2 张**工单；发送前先标完成会丢任务，产生 **0 张**；持久 outbox 加接收端事务幂等，重放后保持 **1 张**。

## 直接运行

只用 Python 3 标准库，代码要求 Python 3.10+，无需安装依赖。必须使用支持 SQLite WAL 的本机文件系统，不要把数据库放在网络共享盘。2026-10-06 实际验证环境：Linux、Python 3.12.14、SQLite 3.53.1。

在本目录执行：

```sh
python3 test_reliability.py
python3 run_experiment.py --check results.json
```

第一条运行 31 个测试，其中一个完整重跑 16 个场景并与仓库结果精确比较。第二条独立重跑实验，把确定性 JSON 打印到 stdout，并校验与 `results.json` 相等。失败返回非零退出码。

保存新运行结果，不覆盖基准：

```sh
python3 run_experiment.py --check results.json --output /tmp/agent-reliability-observed.json
```

从仓库根目录也可直接运行：

```sh
python3 public/examples/agent-reliability-01/test_reliability.py
```

实验和测试使用独立临时目录；子进程全部结束后清理。JSON 没有时间戳、PID、临时路径、耗时或运行时版本，所以可以做精确比较。运行时信息只记录在本说明中，不参与确定性比较。

## 三个数据边界

- `sender.db`：`requests`（本地已接受请求）与 `outbox` 在同一事务写入。outbox 保存固定操作键、规范化 payload、摘要、状态、尝试代次及已验证响应
- `receiver.db`：合成工单 `tickets` 与幂等收据 `receipts` 在同一事务写入；`(caller, operation_key)` 是收据主键。重复请求返回收据中原先的结果
- `external.db`：仅用来模拟另一个**不提供幂等键、不可参加本地事务**的工具。每调用一次就新建一张合成工单。dispatcher 不读取它来作恢复判断

sender 调用新的 receiver 子进程，通过 stdout 管道取得 JSON。两端使用独立连接、独立数据库和独立 COMMIT。没有跨数据库事务，没有 `ATTACH`，没有把“发送记录”和远端副作用假装成一个原子操作。

故障点调用 `os._exit(73)`，直接终止相关进程，跳过 Python 清理和缓冲刷新。之后用新进程和原数据库恢复。退出码 73 表示有意注入故障。

## 恢复规则

1. 先持久化意图。上游没有收到“已接受”时，必须用原键重试入队；outbox 不能恢复从未提交过的意图
2. `BEGIN IMMEDIATE` 串行化 claim。并发领取只允许一个当前代次，发送期间不持有发送端数据库写锁
3. claim 使用逻辑时间租约：长度 10 tick，首轮 `now=0`，恢复 `now=11`。这是为了确定性测试显式注入的时钟，不是生产时钟实现
4. 幂等接收端收到同键同参数时，验证原收据和工单后返回同一结果。相同参数换新键表示新的业务意图，应该新建工单
5. 同键不同参数直接拒绝。键表达操作身份，payload 的 SHA-256 仅用来发现参数不一致，不用来替代键
6. sender 只在响应结构、操作键、caller、payload 摘要匹配后记录 done。ACK 更新要求尝试代次仍匹配，旧租约持有者不能覆盖新状态
7. 非幂等外部工具一旦结果不明，进入 `unknown`，不自动重试。即使实际是“还没调用就崩溃”，过期租约也不能据此推断安全

租约和 ACK 代次保护**本地领取及状态写入**，不阻止失去租约的旧 worker 继续触发远端调用。接收端事务幂等才是吸收这些重复调用的边界。

## 16 个场景的实际观察

| 场景 | 故障／竞争后恢复的关键结果 |
| --- | --- |
| `naive_lost_ack` | outbox 在，但接收端没有去重：工单 1 → 2，sender 最终 done |
| `mark_before_send_loses_task` | 先标 done、发送前退出：工单 0，重启仍不发送 |
| `idempotent_lost_ack` | 接收端 commit 后、写回包前退出：工单 1 → 1，第二次尝试确认 done |
| `before_intent_commit` | 请求与 outbox 都回滚；上游同键重试后工单 1 |
| `after_intent_commit` | 意图已保留；同键重试入队不重复，最终工单 1 |
| `after_claim` | 尚未调用接收端；租约过期后恢复，工单 1 |
| `before_receiver_commit` | 工单与收据都未提交，重启后可一起重做，工单 1 |
| `after_response_write` | 完整响应已经 flush 到管道后进程退出；sender 验证后直接 done，仅尝试 1 次 |
| `after_response_before_ack` | sender 已得到响应但未持久化本地 ACK 就退出；重放返回原工单，工单 1 |
| `after_ack` | done 已提交；重启不再发送，工单 1 |
| `mismatched_payload` | 同键不同参数被拒绝，仍只有工单 1 |
| `concurrent_claim` | 8 个进程争抢，当前领取者 1；过期旧代次 ACK 被拒绝 |
| `concurrent_receiver` | 8 个进程提交同键，工单 1、收据 1、不同响应内容数 1 |
| `before_external_effect` | 工具实际未执行，sender 仍只能记 unknown；工单 0，不自动重试 |
| `after_external_effect` | 工具实际已执行，sender 同样 unknown；工单 1，不自动重试 |
| `unsafe_external_retry` | 故意绕过 unknown 安全策略，直接重调非幂等工具：工单 2 |

注意 `after_response_write` 并不是“回包丢失”：在这个本地管道实验里，完整且可验证的响应已经到达调用方。因此接收端稍后异常退出不应把已验证成功错误地改成失败。

unknown 两种场景的工单数来自测试观察器读取合成外部数据库，用来说明事实不同。运行中的 sender 没有这项可见性，不能把观察器的答案当成真实业务的恢复能力。要解除 unknown，需要工具提供可核验的业务状态／稳定操作标识，或人工核对和明确处置。

## 单步查看真实数据库

以下操作只写新的 `/tmp` 示例目录；`init` 拒绝覆盖已有数据库：

```sh
DIR=$(mktemp -d)
python3 reliability.py init --root "$DIR"
python3 reliability.py enqueue --root "$DIR"
python3 reliability.py dispatch --root "$DIR" --fault after_receiver_commit --now 0
python3 reliability.py snapshot --root "$DIR"
python3 reliability.py dispatch --root "$DIR" --now 11
python3 reliability.py snapshot --root "$DIR"
```

首次 dispatch 输出 `no_ack`。首次 snapshot 是 `inflight`、1 张工单、1 张收据；恢复后是 `done`、2 次尝试、仍为 1 张工单。该目录保留供检查。不要只复制 `.db` 而丢弃仍存在的 `-wal`，不要手工删除活跃数据库的 WAL 文件。

## 测试覆盖与边界

除上面的真实进程退出／恢复／并发矩阵外，测试还覆盖：生产者重复入队、键作用域、同内容新键、参数顺序、错参数、错误响应、旧 ACK、记录损坏、无效 JSON、丢失数据库、非法数据库头、收据与工单不一致、保留期删除收据后重放的反例，以及子进程超时／启动中途失败的清理。最后两项使用 mock 检查清理逻辑，其余数据库行为在本地执行。

恢复矩阵结束后，对所有数据库运行 `PRAGMA quick_check` 和 `PRAGMA foreign_key_check`。这些断言不等于证明所有磁盘故障都能恢复。摘要也不是安全认证；恶意修改者同时更改数据和摘要不在此校验的保证内。

本例保证需要同时满足：

- 操作键在重试间稳定，caller 与业务操作命名空间一致。示例只支持一种 `issue_ticket` 操作；多工具系统还需把工具名、操作版本等纳入明确的键作用域
- 接收端副作用、幂等收据和返回结果在**同一个受控数据库事务**内提交
- 收据覆盖全部可能的重试时间窗口，且备份恢复不把工单与收据恢复到不一致时点。示例不自动清理收据
- SQLite、本地文件系统和存储按其持久性契约工作。所有连接启用 WAL、`synchronous=FULL`；这次只注入进程退出，没有模拟 OS 崩溃、断电、磁盘静默损坏或真实网络故障
- 有恢复调度继续处理待确认任务。例子由 runner 显式触发恢复，不含常驻守护进程、退避、抖动、重试预算和生产时钟设计

SQLite WAL 当前官方文档说明了已修复的 WAL-reset 问题；这次验证用的 SQLite 3.53.1 包含修复。部署或并发复现时应检查 Python 实际链接的 SQLite，而非仅看 Python 版本；使用包含官方修复的版本。详情和补丁分支见 [官方 WAL 文档](https://www.sqlite.org/wal.html#walreset)。

为了让损坏、参数冲突显式暴露，示例将 receiver 报出的检查／数据库错误停止为 `blocked`，不尝试自动修复数据库。生产实现应区分可重试的锁竞争与需要隔离的损坏，并记录、告警及提供人工处理流程。

**结论范围：outbox 让“已经接受的意图”可恢复；接收端事务幂等让这一受控副作用可安全重放。不能由此对任意外部工具宣称端到端 exactly-once。**

## 文件

- `reliability.py`：发送端、接收端和故障注入 CLI
- `run_experiment.py`：16 个独立场景及确定性 JSON 生成／校验
- `test_reliability.py`：31 个标准库 unittest 测试
- `results.json`：真实执行生成的确定性结果

## 官方来源

以下来源已于 2026-10-06 核验，用于解释设计依据；16 场景数值来自本目录真实执行结果。没有调用 AWS 服务。

- [SQLite: Transaction](https://www.sqlite.org/lang_transaction.html)：显式事务、单写者和 `BEGIN IMMEDIATE`，以及需要处理的 `SQLITE_BUSY`
- [SQLite: Write-Ahead Logging](https://www.sqlite.org/wal.html)：WAL 提交与恢复、本机限制、WAL 文件属于持久状态、多数据库不能合成一个原子事务，以及已修复的 WAL-reset 问题
- [SQLite: PRAGMA synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous)：`FULL` 的同步语义；此配置不能把本次进程退出测试提升为硬件断电验证
- [AWS Builders' Library: Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)：调用方稳定键、原子记录副作用与幂等收据、语义等价响应、同键不同意图、晚到请求的保留期问题
- [Amazon EC2: Ensuring idempotency in Amazon EC2 API requests](https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-idempotency.html)：真实 API 参数不一致拒绝策略的例证；不表示本例实现或测试了 EC2 契约
