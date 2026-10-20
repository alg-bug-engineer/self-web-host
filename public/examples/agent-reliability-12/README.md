# Agent 可靠执行实战（十二）：公平机会、退避与隔离

Python 标准库教学实验，queue.db 和 receiver.db 两个独立 SQLite 文件。可信合成事件每流程连续编号，delta 累加是接收端本地效果。没有模型、broker、网络、付费 API、真实业务或生产权限系统。

## 重现

五个文件下载到同一空目录，Python >=3.10，SQLite >=3.24.0（UPSERT）：

    python3 test_fair_relay.py
    python3 run_experiment.py --check
    python3 run_experiment.py --output reproduced.json
    python3 -c "import sys,sqlite3; print(sys.version); print(sqlite3.sqlite_version)"

本次 Linux / Python 3.12.14 / SQLite 3.53.1，40 tests，16 named scenarios。六个真实 os._exit(73) 崩溃点，八进程同时领取；错误字典序选择对照是纯调度算例。输出完整比较数据库快照，不冻结 PID、临时路径、耗时或进程赢家。20/30 秒是防挂死看门狗，不是业务耗时。未验证 Windows、断电、磁盘损坏、网络分区。

## 实际契约

- enqueue 原子分配本流序号并写事件；同 ID 内容冲突不变更。没有跨业务库原子事务。
- claim 先找每流第一条未 acked 事件，quarantined/inflight/未到退避的头部阻止同流后续事件，不阻止其他流。
- 在可派发头部中选择 served 最小者；领取时在同一事务增加全局 ticket，更新 flow.served、generation、attempts/lifetime_attempts 与租约。失败或发送前崩溃也消耗机会与预算。
- 有限且持续符合条件的流程获得轮转机会，不保证等耗时、吞吐或最终完成。新流 served=0，持续新流可能挤占旧流，测试保留此反例。
- 租约 5、实际退避 2/4 都是逻辑刻度；公式上限 8 在当前三次领取预算下不会触发，因为第三次失败直接隔离。所有队列写接口拒绝逻辑时间倒退。不是生产时钟或秒数；stale 回调也可能推进全局 tick，时刻由可信测试调度统一给出。三次领取为一轮预算。
- settle 必须匹配 inflight、generation 且尚未过 lease_until。过期但未被接管也返回 expired。过时代次返回 stale；不能覆盖新轮状态。检查不撤销在途请求。
- receive 的 accepted 在本例表示 receipt 与 delta 本地效果同事务完成，与第十一篇持久 inbox 的 accepted 语义不同。同 ID 同原正文 duplicate；ID/序号冲突保留为冲突；gap 不跳步。
- redrive 只允许匹配代次的 quarantined，必须给非空原因；原正文/ID/序号不变，generation 增加，当前轮 attempts 重置，lifetime_attempts 保留，并原子写 audit。重投会清空 event.reason；audit 保存操作者重投原因与新代次，不保存旧隔离原因或每次失败的完整历史，不是完整故障审计日志。它是可信操作者入口，不实现身份/审批权限。token、result 和原正文同样来自可信本地调用链，generation 不是认证或签名。人工重投可增加总次数，三次不是终身预算。
- unsupported_delta 是合成接收能力上限，切换 max_delta 演示已评审修复后的原消息重放，不是真实热部署。unavailable 是发送前合成缺回音，不是网络实验。
- SQL 异常直接抛出；不是自动 retry。触发器验证入队、收件效果、重投审计的原子回滚。
- WAL、synchronous=FULL；snapshot 单库读事务，工作进程结束后采样，不是跨库一致快照。记录永久保留，init 不清空状态。

## 未实现与假设

可信命名空间、受限正整数 delta（1..1000）、稳定原正文、正确SQLite状态与受控入口。没有认证、租户隔离、总积压容量、随机抖动、守护循环、限流、告警、重试终身预算、删除/TTL、灾备、跨节点锁或生产服务集成。无界持续新流量、全局公平、吞吐与最大等待时长均不作保证。

## 资料（2026-10-20核对）

- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
- https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- https://www.sqlite.org/lang_transaction.html

官方来源用于解释边界，不代表部署或验证了其云服务。AI 辅助制作。
