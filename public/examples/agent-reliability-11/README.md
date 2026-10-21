# Agent 可靠执行实战（十一）：有序 outbox / inbox

Python 标准库教学实验：两个独立 SQLite 文件，可信合成流程 new → reserved → confirmed → released。没有模型、broker、网络、生产身份、远端工具、付款或真实资源。effect 和 projection 只表示消费端同一数据库里的本地记录，不能当成外部副作用完成证明。

## 重跑

五个文件放到同一空目录；Python >=3.10，链接 SQLite >=3.24.0（UPSERT）：

    python3 test_ordered_events.py
    python3 run_experiment.py --check
    python3 run_experiment.py --output reproduced.json
    python3 -c "import sys,sqlite3; print(sys.version); print(sqlite3.sqlite_version)"

本次环境 Linux / Python 3.12.14 / SQLite 3.53.1。48 tests，22 scenarios；10 个真实 os._exit(73) 边界，1 个故意错误的双写 os._exit(81)，六进程并发，以及 Event 握手控制的乱序 3→1→2。六种到达排列均有测试。20/30秒是挂死看门狗，不是性能指标。未测试 Windows、断电、磁盘损坏或跨机器分区。results 全量比较状态与记录；不冻结调度赢家、PID、路径或耗时。

## 协议

- producer.db：flow 保存源状态；outbox 保存已提交迁移的不可变事件。advance 在同一 BEGIN IMMEDIATE 事务内检查历史、检查 expected_seq、分配 seq、改状态并插入 outbox
- consumer.db：receive 先独立持久保存 inbox；event_id 与 (flow_id,seq) 两重唯一，正文不一致返回冲突。relay 仅在 accepted/duplicate 后保存 outbox.accepted=1
- accepted 是持久保管责任转移，不是业务已应用。receive 不改变 projection 或 effect。消费者承接待办持久化、恢复和告警责任
- apply_next 只处理该 flow 的 last_seq+1。projection、effect、inbox.applied 同事务；缺口返回 gap，不跳过。未知版本、非法负载或迁移写 blocked/reason，原正文不变
- schema1 使用 payload.amount；schema2 使用 payload.units。生产者能发1/2，默认消费者只支持1；显式 support_v2=True 启用已实现的2版解码，再应用原记录，不换ID/序号
- 同一流程固定数量1..1,000,000，三个不可跳步阶段，无重开或循环。ID限1..100 ASCII标识字符。seq 使用正64位整数边界；支持范围内依然不提供总积压容量限制
- 所有拒绝不是同一种回执：成功生产事件留存；producer 的 stale/invalid_transition 不被永久记忆。收件传输外壳错误抛异常，语义错误保留blocked。数据库错误直接传播

## 故意保留并测试的限制

默认 relay 每次选第一个未确认事件；永久身份冲突可令 A 持续被选中，使后面的 B 饥饿。default_relay_conflict_can_starve 实际复现三次重复冲突，随后显式选择 B1 才投递成功。process_all 的跨流程隔离只针对应用阶段；没有实现公平派发、退避、DLQ、自动告警或调度服务。不得把冲突假装确认来清空待办。

消费者不能跳过缺失/blocked条目。数据修复、跳过规则、schema迁移需要额外业务决定，样例没有自动修改原事件入口。未知schema持久收件意味着消费者承担积压责任，并非无条件兼容所有输入。

只有一个可信生产者命名空间。未实现多来源身份认证、租户隔离、跨流程原子顺序、重新建流/旧备份恢复后的代次、删除/TTL、CDC或外部副作用。seq仅在本流程的每条已提交事件上连续；有过滤的订阅不能直接复用别的全局序号。记录一直保留。

每文件启用 WAL 与 synchronous=FULL；init不重置状态。snapshot 在每个文件内开启读事务，跨文件不是原子快照；报告只在工作进程退出后采样。unsafe_* 为明确的错误对照，不被安全路径调用。drain有界，返回limit、gap或具体阻塞原因不等于完成；blocked是inbox状态。不提供最终必达或通用exactly-once保证。

## 来源（2026-10-19核对）

- https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
- https://www.sqlite.org/lang_transaction.html
- https://www.sqlite.org/wal.html
- https://www.sqlite.org/lang_upsert.html

来源用于模式/语义说明，本文没有部署上述云服务。AI辅助制作，实验代码、合成数据与冻结观察供独立审查复现。
