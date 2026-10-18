# Agent 可靠执行实战（十）：两步预留与补偿状态机

Python 标准库教学实验，合成设备与安装时段预留。没有模型、网络、真实订单、支付或生产认证。

## 复现

五个文件放到同一空目录，Python >=3.10：

    python3 test_saga.py
    python3 run_experiment.py --check
    python3 run_experiment.py --output reproduced.json

Linux / Python 3.12.14 / SQLite 3.53.1：37 tests，19 scenarios。12 个真实 os._exit(73) 崩溃点；六进程同业务和跨业务并发；真实进程 Event 握手迟到请求。看门狗超时不代表性能指标。未测 Windows、主机断电、网络分区或集群。

## 三个独立提交域

stock.db 与 slots.db 各自原子保留操作 ID、数量和终态，flow.db 保存恢复阶段。没有跨文件事务。参与者调用发生在协调器写事务之外。状态图无回边，用阶段 CAS 阻止旧结果倒退状态；不能照搬到有循环/重开/版本迁移的工作流。

reserved 占用资源；rejected 为持久业务拒绝，不因后续容量释放重新尝试；released 墓碑阻止旧预留复活。释放只改同 ID 预留，不恢复旧总量。事件表保留一次预留/释放记录，并非防篡改审计日志。

slot_pending 收到明确、持久 rejected 后才能进入 release_pending；缺回音保留原阶段。只有释放确认才能 aborted。恢复时重复同 ID 命令读回终态，不重复占用或释放。释放前到达时写墓碑；此能力不构成取消授权。

## 条件与缺失能力

稳定操作 ID 与不可变数量，可信协调器/参与者，终态不被外部改写/清理，数据库持久数据不丢失。所有工具只能走受控入口。没有授权、身份、租户隔离、真实审批、跨 ID 订单去重、取消已完成订单、退款、不可逆动作、TTL 清理、队列、自动重试/告警。finish 是有界测试驱动，异常传播，不能保证终将完成。

单资源 snapshot 采用显式读事务。跨三个文件的 report 不是原子快照，只在子进程退出后采样。init 不重置已使用资源，容量不一致报错。unsafe_snapshot_restore 是合成算术反例，其余场景执行本地数据库协议。results 不记录调度赢家或耗时。

每个资源容量 <=1,000,000，单次数量1..1,000,000；拒绝 bool、非法 ID 和变更数量。代码为有限教学边界，不是高负载资源服务。

来源（2026-10-18 核对）：
- https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
- https://www.sqlite.org/lang_transaction.html

AI 辅助制作，代码与合成数据供审查复现。
