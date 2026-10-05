# RAG 评估 05：固定真实输出的引用审计

这是对 ALCE 已发布 ASQA 模型输出及人工/自动标签的**独立聚合与一致性审计**，不是本次生成的新回答。这里没有调用生成模型、重新运行 NLI、重新做人工标注，也不把正则匹配当成语义支持判断。

## 1. 固定输入与来源

- 上游：[princeton-nlp/ALCE](https://github.com/princeton-nlp/ALCE)
- 固定提交：`246c476a4edfc564266b7346b6e29ef4861ae937`
- 文件：`human_eval/human_eval_citations_completed.json`
- SHA-256：`cfed9293752413d7c7631f36524dd4ee9ef58b209cdf9c63f6fc1e280b43cca6`
- 大小：4,566,797 bytes
- 选择规则：读取 `asqa` 下 `asqa-gpt-35-turbo-gtr-shot2-ndoc5-42-azure.json` 的**全部**问题记录；只跳过保留汇总键 `overall_results`。不按正确/错误标签挑选记录
- 上游文件名给出的模型别名为 Azure `gpt-35-turbo`，还编码了 GTR、2-shot、5 篇检索文档、seed 42。该标注文件没有提供精确到日期的后端模型版本，不能凭别名补齐，也不应用今天的同名部署解释历史结果

来源与评分定义：

1. [论文：Enabling Large Language Models to Generate Text with Citations](https://arxiv.org/abs/2305.14627)，Gao, Yen, Yu, Chen，EMNLP 2023
2. [固定版本 human_eval/README](https://github.com/princeton-nlp/ALCE/blob/246c476a4edfc564266b7346b6e29ef4861ae937/human_eval/README.md)：人工句子标签和单条引用标签定义
3. [固定版本 analyze.py](https://github.com/princeton-nlp/ALCE/blob/246c476a4edfc564266b7346b6e29ef4861ae937/human_eval/analyze.py)：句子召回门控、非零引用标签二值化、逐问题宏平均、空列表按 0 处理
4. [固定版本 eval.py](https://github.com/princeton-nlp/ALCE/blob/246c476a4edfc564266b7346b6e29ef4861ae937/eval.py)：自动引用评估逻辑；命令行默认每句至多处理 3 次引用

## 2. 运行

需要 Node.js 20+；不需要 npm 包、API key、GPU。

```bash
cd public/examples/rag-evaluation-05
node download.mjs
node audit.mjs > /tmp/rag-citation-audit-results.json
node --test test.mjs
```

下载来自固定提交的 raw.githubusercontent.com URL。下载完成先检查完整字节 SHA-256 和大小，通过后才原子替换缓存；HTTP 错误、HTML 错误页、任何内容变化都停止。源文件默认放在操作系统临时目录的 `rag-evaluation-05/<sha256>.json`，**不会放进网站 public 目录**。临时目录可能被系统清理，需要时重新下载。

已通过 Git 或浏览器取得相同固定文件时，可以离线导入；校验不放宽：

```bash
node download.mjs --from /absolute/path/human_eval_citations_completed.json
node audit.mjs
```

也可直接指定原文件，并重建本目录的聚合结果：

```bash
node audit.mjs --input /absolute/path/human_eval_citations_completed.json --out results.json
```

从仓库根目录运行完整回归：

```bash
RAG_CITATION_SOURCE=/absolute/path/human_eval_citations_completed.json \
  node --test scripts/tests/test-rag-citations.mjs
```

未设置 `RAG_CITATION_SOURCE` 时，合成单元测试与已提交结果的校验仍运行，真实源文件的端到端比对明确显示为 skipped。已提交 `results.json` 来自固定源文件的实际执行，不是由测试 fixture 生成。

## 3. 先确定统计单位

该切片有 100 个问题记录：99 个非空输出、1 个空输出。空输出仍占问题分母并记 0，但不凭空添加句子。所有已有句子都纳入审计，共 236 个上游分句单元；其中有 2 个只有引用标记和标点的单元，也有拒答/信息不足句。没有重新做分句、事实筛选或“原子 claim”标注。

- 205/236 句出现数字引用标记，即 86.8644%；这是结构覆盖
- 句子文本有 306 次数字引用出现；有分数的引用数组只有 290 项
- 10 句超过 3 次引用，差额合计 16 次。数组长度全部符合 `min(数字标记出现次数, 3)`；这与上游默认上限兼容
- 2 句重复引用同一数字 ID，额外出现共 2 次。保持**出现次数**权重，不擅自按文档去重
- 注释条目没有显式文档 ID，因此仅验证数量结构；不声称已证明某个数组项就是某个特定数字 ID 对应的文档
- 同一问题内完全相同的重复句子文本为 0；跨问题也不合并统计单位

只有每个单元的最终发布标签可见。本文件没有提供标注者身份、逐人投票、共识票数或完整仲裁历史，不能把某个浮点 `1.0` 当成多标注者平均，也不引入额外的“共识权重”。

## 4. 语义与分母

人工 `sentence_recall_score`：1 表示引用文档集合完全支持该句，0 表示未完全支持。它是**联合支持**标签，不等于整个回答的事实正确性。

人工 `citation_precision_score`：0=不支持，1=部分支持，2=完全支持；分母是有标签的 290 次引用出现，不是 306 个数字标记，也不是 236 句。

上游 `analyze.py` 的引用接受规则是：

```text
accepted = (sentence_recall_score == 1) AND (citation_precision_score > 0)
```

因此“被接受引用”可以只有部分支持，不能改名为“每条引用完全蕴含”。本实验分别给出原始 0/1/2 统计和门控后的接受率。

自动引用原始数组同样出现 0/1/2，但 human_eval README 没有完整解释每个自动原始值的生成语义，`eval.py` 也不直接输出这份人工评估文件的完整结构。因此只复用 `analyze.py` 明确使用的“自动句子标签为 1 且自动引用值非零”变换，不把自动值 2 直接解释为人工定义的 full。

宏平均对每个问题先取均值，再平均 100 个问题；空输出、没有引用的记录，按上游脚本记 0。微平均直接累加单元标签后除以句子数或有标签的引用次数。零分母的微平均返回 `null`，不伪装成测得的 0。

## 5. 实测结果

| 指标 | 分子/分母或平均口径 | 结果 |
|---|---|---:|
| 人工句子完全支持，微平均 | 168/236 | 71.1864% |
| 已归档自动句子支持，微平均 | 171/236 | 72.4576% |
| 人工句子完全支持，等问题宏平均 | 100 个问题的句内均值再平均，空输出为 0 | 74.6917% |
| 自动句子支持，等问题宏平均 | 同上 | 75.3500% |
| 非空且每句人工完全支持的回答 | 59/100 | 59.0000% |
| 有数字引用但人工未完全支持的句子 | 37/205 | 18.0488% |
| 人工单条引用原始 full 标签 | 195/290 | 67.2414% |
| 人工单条引用原始 partial 标签 | 58/290 | 20.0000% |
| 人工单条引用原始 none 标签 | 37/290 | 12.7586% |
| 人工门控后接受率，微平均 | 228/290 | 78.6207% |
| 自动门控后接受率，微平均 | 218/290 | 75.1724% |
| 人工门控后接受率，等问题宏平均 | 100 个问题的引用均值再平均 | 76.5798% |
| 自动门控后接受率，等问题宏平均 | 同上 | 74.3635% |

人工与自动句子标签混淆矩阵，行=人工 0/1，列=自动 0/1：

```text
        auto0  auto1
human0     51     17
human1     14    154
```

共 31/236 个句子标签不一致；17 个自动阳性、人工阴性；14 个方向相反。两种错误不能靠近似的均值判断消失，也不能把人工标签当成绝对事实。`results.json` 的 `sentenceDisagreementRecords` 完整列出这 31 个问题 ID/句子下标/二元标签，不含原文。

门控后的引用接受标签混淆矩阵是 `[[37,25],[35,193]]`，分母 290，**不是**原始 0/1/2 混淆矩阵。

58 条 partial 引用中，34 条处于人工句子标签 1 的句子，24 条处于标签 0 的句子。还有 1 条 full 引用处于人工句子标签 0 的句子；保留这类不一致，不自动“修复”。

`overall_precision_score` 与本文逐引用、经句子门控的聚合在 33 个问题上不同；`overall_recall_score` 与本文逐句重算一致。不同字段可能代表不同聚合定义，仅有差异不能断言标签错误。保留汇总键 `overall_results` 不作为本文指标输入。

## 6. 失败即停与测试边界

验证固定源哈希、选择键、问题 ID 唯一性、JSON 重复键（包括转义别名）、必需数组与等长关系、合法数字标签、非稀疏数组、空输出一致性、按顺序拼接的句子与原输出的空白规范化一致性、引用标记语法及 1–5 范围、明确的至多 3 次引用计分形状。

未知标签、遗漏数组、少算/多算引用、替换/调换句子、空输出与注释冲突都必须抛错，不静默跳过。结构规则只能发现坏输入，不能创造语义标签。

`test.mjs` 的微型数据与变异是专门编造的工程测试输入，用来验证分母、空集、门控和失败路径；不能充当真实模型实验。真实数据测试单独读取完整固定源文件，对实际重算结果与 `results.json` 做深度相等检查，并验证篡改字节会被拒绝。

## 7. 权利与分发

上游 ALCE 仓库的[固定版本许可证](https://github.com/princeton-nlp/ALCE/blob/246c476a4edfc564266b7346b6e29ef4861ae937/LICENSE)为 MIT，版权归 Princeton Natural Language Processing（2023）。本目录对指标和验证流程独立实现，引用来源和规则；没有拷贝上游模型输出或检索段落到网站。

仓库的 MIT 声明不能据此当作底层 Wikipedia 段落的一揽子重新许可。上游 README 说明 GTR 使用 DPR Wikipedia 快照；原文可能涉及独立的署名、版本、许可及来源要求。这里默认只在读者本机临时目录下载完整文件，网站只发布代码、聚合结果和少量标识符，避免重新分发来源复杂的原文。请勿把下载文件移入 `public/`、提交到 Git 或作为站点静态资源上传；`.gitignore` 只是额外保护。
