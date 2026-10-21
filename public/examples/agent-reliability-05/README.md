# Agent 可靠执行实战（五）：持久派发预留

Python 3.10+，仅标准库。下载本目录五个文件到同一个空目录：

```sh
python3 test_durable_budget.py
python3 run_experiment.py --check
python3 run_experiment.py --output reproduced.json
```

本次运行：Python 3.12.14 / SQLite 3.53.1，24 项 unittest 与 8 组具名场景通过。results.json 存储可重复的语义状态，不含墙钟耗时、PID 或临时路径。--check 会重新创建数据库、启动子进程并比较整个结果，不是读取存档后直接报成功。测试使用 selectors 监视管道，实测于 Linux；未验证 Windows 管道兼容性。

- durable_budget.py：发送端 task/reservation 和独立接收端 calls/effects/receipt；BEGIN IMMEDIATE 原子预留，WAL + synchronous=FULL
- run_experiment.py：真实子进程 os._exit 故障注入、8 个工作进程事件握手、故意错误退款反例
- test_durable_budget.py：配置不可重置、事务回滚、退出恢复、耗尽、并发、幂等参数冲突及 unknown 断言
- results.json：实际执行得到的确定性状态

## 计数和不变量

cap 是单业务意图的总预留上限，包含首次请求。spent 只增不减；每次新的获准尝试在同一事务递增 spent 并插入 reservation；未提交事务退出会回滚。reserve() 返回仅供当前调用栈使用的一次性许可，attempt() 不扫描或重发已有 reservation。恢复只能申请新预留，不重用旧票。业务操作 ID 保持 op-1，预留序号改变。

在受控入口和无隐藏重试的假设下：接收端进入次数 <= 已提交预留数 <= cap。calls 是本地测试仪器的接收端入口日志，先单独提交，因此参数冲突也计数；它不是生产协议回执，也不是网络抓包。effects 是接收端业务表行数。不可用一者替代另一者。未确认预留不能证明已发出或未发出。

配置再次初始化只接受相同 payload/safety/cap，不重置 spent。业务幂等与预算分开；non_idempotent 有旧预留时，剩余额度也不允许盲目重试。安全实现不提供退款 API；run_experiment 的 unsafe_refund_counterexample 明确故意破坏账本，只用于证明缺回执就退款会让 cap=1 的任务进入接收端 3 次。

## 实验边界

业务工单字符串、错误注入位置与调度顺序是合成的；子进程、SQLite 提交、退出恢复与检查是真实执行。两个数据库均在同一台机器的临时目录，多个工作进程共享发送端本地 WAL。没有网络服务、SDK、LLM、用户数据、凭证、真实收费或支付。15 秒是测试防挂 watchdog，不是业务 deadline。

没有实现：时间域转换/持久 deadline、跨机事务或共识、真实消息代理、网络分区、硬件断电、磁盘损坏、认证、多租户、租约与 fencing、服务级流量控制、真实远端收据验证。普通确认函数仅用于可信测试流，不能给不受信任调用方开放。示例的单次控制流是计数上界的必要前提；若直接调用 receive、复制同一 ticket 多次发送或在 SDK 内隐式重试，保证不成立。

已预留的旧工作进程仍可能稍后发出；confirmed 只阻止后来的新预留，不撤销已授予许可，也不证明所有在途请求终结。幂等接收端负责这些重复调用的效果去重。生产若要求停止之后无新写入，需要额外协议，不能靠删预留或退钱实现。

保守预留可能耗尽而没有任何实际效果，这是有意的安全/活性取舍，不是成功交付保证。不要在恢复、克隆任务、切工作进程、清理旧行或恢复旧快照时悄悄补满额度。
