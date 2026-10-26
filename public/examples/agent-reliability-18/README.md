# 持久取消与安全停靠（教学项目）

Python 3.10+，仅标准库。保存本目录六个文件到同一目录后运行，不要使用 `python -O`（实验断言是验收的一部分）：

```bash
python3 test_cancellation.py
python3 run_experiment.py --check
python3 audit_invariants.py
```

实际验证：36 项 unittest；12 组冻结场景，含 24 个真实进程退出边界、4 组各 8 个 READY/GO 门控进程；独立参考模型 48 个种子各 300 次操作，共 14,400 次，含 2,881 次显式重复尝试；32 组各 4 个门控并发进程，共 128 个进程。审计把返回值和最终状态与每组最多 24 种合法串行次序对照。有限测试不是穷尽证明或生产压力测试。

`run_experiment.py --check` 真正重新运行 SQLite 和子进程，再比较 `results.json`。不带 `--check` 有意重建文件，不应用来掩盖未知差异。竞争结果只冻结不变量，不冻结哪个进程赢锁。30 秒等待仅是测试防挂死措施，不是性能数据。

## API 与契约

- `init(path)`：建立单个本地协议数据库。
- `submit(path, job_id, steps)`：原子保存 1..32 个有序请求字符串。相同身份和清单重放，修改冲突。请求字符串最多 1024 个 UTF-8 字节。
- `request_cancel(path, event_id, job_id, steps)`：绑定精确有序清单的持久取消。早于提交时建立不可复活墓碑；任务已提交时请求停止新预留；若结果已终结则返回 `too_late`，不伪造成功撤销。
- `reserve(path, job_id)`：顺序预留下一步，一次最多一个 `inflight`/`unknown`。已有预留仅返回 `inflight` 身份，不表示可重新发起不可幂等工具。取消持久化后禁止新预留。
- `report(path, event_id, job_id, seq, outcome, value='')`：可信入口提交 `unknown`、`ok` 或 `rejected`。未知不结清预留。相同事件重放原解释；同 ID 改内容冲突；终态不可覆盖。`rejected` 必须来自确定证据，不能把超时推测写成拒绝。
- `checkpoint(path, job_id)`：只有取消已请求且没有在途/未知预留才确认。幂等。
- `inspect(path)` / `check_invariants(path)`：一致快照和跨表关系检查。

`control` 是 `run → requested → acknowledged`；早取消墓碑可直接 acknowledged。`result` 是 `open → succeeded/failed`。取消不抹去结果；最后一步在取消请求后完成时，可以同时出现 acknowledged 和 succeeded。acknowledged/open 表示剩余步骤没有完成而协议停止，不表示仍可继续领取。

所有 ID 的范围是该数据库；取消与回执共用 event_id 空间。拒收的合法事件也保存原回执。重试仍需相同 ID、相同内容，新事件身份不能修正已保存终态。墓碑与回执永久保留，没有容量/清理保证。

## 重要边界

全部业务请求/回执为合成数据，不调用模型、RPC、生产服务或付费 API。协议并不验证报告的真伪、发送者身份、worker 资格或真实外部停止。示例没有派发器、租约、执行代次、重试扫描器、超时、自动补偿、多租户认证、管理端改判、生产背压。

取消之后仍可能执行取消之前已预留的工作。本例宁可保留在途未知、阻止 checkpoint，也不从“取消了”推断“没发生”。预留后但尚未发送就崩溃时，同样不能凭空释放：需要另行设计可靠对账或接收端封口，本项目不提供自动解决。acknowledged 只意味着此协议内没有未结预留且不再产生新预留，不证明 OS 进程退出、远端不会出现迟到副作用或所有旁路都受控。

一组实验使用第二个临时 SQLite 文件模拟接收端，并真实提交后退出，展示效果不会被取消删除。查询和提交 `ok` 是测试仪器的可信核验，不是生产网络查询保证。所有崩溃点用 `os._exit(73)`，不模拟断电、磁盘损坏、跨机时钟或跨库原子事务。

源文件由 AI 辅助制作并实际运行，适合讨论和复现机制，不是可直接上线的 Agent 框架。
