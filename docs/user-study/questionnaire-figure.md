# Figure Questionnaire / 最终图片问卷

本文件严格区分两类评价：

1. **作者逐图自评**：每个条件结束后，只评价自己刚生成的图片；
2. **专家成对盲评**：只比较同一任务下匿名的 `HiFigure` 与 `GPT_Baseline` 输出，判断哪张图更好。

# Part P. Author self-rating / 作者逐图自评

每个条件结束后填写一次，共 **14 题**（PREVis 9 题 + IGV-derived 2 题 + 科研内容与结构 3 题），预计 4–5 分钟。参与者先提交系统问卷，再进入新页面查看唯一最终图片及该任务的简短说明。

## Instructions / 指导语

**EN:** Rate only the final static figure currently displayed. Judge the figure against the task brief and source material. Ignore how the figure was created and how easy the system was to use. Your answers describe your own perception; they do not establish how an independent reader would understand the figure or whether every scientific statement is correct.

**中文：** 请只评价当前显示的最终静态图片，并对照任务说明与源材料作答。不要考虑图片如何生成，也不要考虑系统是否好用。答案仅代表您本人的主观判断，不能证明独立读者一定能够理解该图，也不能证明其中每项科研内容均正确。

```text
[FIGURE: fixed display size, neutral background]
[SHORT TASK BRIEF + SOURCE MATERIAL LINK]
```

## P1. PREVis perceived readability / PREVis 主观可读性

**Source / 来源：** Cabouat, A.-F., He, T., Isenberg, P., & Isenberg, T. (2025). PREVis: Perceived Readability Evaluation for Visualizations. *IEEE Transactions on Visualization and Computer Graphics, 31*(1), 1083–1093. https://doi.org/10.1109/TVCG.2024.3456318

**Official instrument / 官方材料：** https://aviz.fr/PREVis/

### Measurement status / 测量状态

- 使用 PREVis 的三个完整子量表：`Understand`、`Layout` 与 `DataRead`，共 9 题。三个子量表必须分别计分，不能合成总体 PREVis。
- PREVis 验证材料包含 node-link representations，但并非专门针对“科研方法图作者评价自己的作品”验证。因此这里测量的是 `author-reported perceived readability`，不是受众理解或事实正确性。
- 为保留原量表证据，正式英文计分版本逐字使用下列题目，不替换 `visualization` 或 `data`。中文仅为研究团队翻译辅助；若参与者主要依据中文作答，应称 `translated PREVis`，不能声称是已验证中文版。

### Response scale / 作答量尺

| Value | English | 中文辅助说明 |
|---:|---|---|
| 1 | Strongly disagree | 非常不同意 |
| 2 | Disagree | 不同意 |
| 3 | Slightly disagree | 略不同意 |
| 4 | Neutral | 中立 |
| 5 | Slightly agree | 略同意 |
| 6 | Agree | 同意 |
| 7 | Strongly agree | 非常同意 |
| N/A | I don't know / Not applicable | 不知道／不适用 |

### Understand / 理解性

| ID | Validated English wording | 中文辅助翻译 |
|---|---|---|
| IMG-U1 | It is obvious for me how to read this visualization. | 我一眼就知道应该如何阅读这张可视化。 |
| IMG-U2 | I can easily understand how the data is represented in this visualization. | 我能轻松理解数据在这张可视化中是如何呈现的。 |
| IMG-U3 | I can easily understand this visualization. | 我能轻松理解这张可视化。 |

### Layout / 布局清晰度

| ID | Validated English wording | 中文辅助翻译 |
|---|---|---|
| IMG-L1 | I don't find this visualization messy. | 我不觉得这张可视化杂乱。 |
| IMG-L2 | I don't find this visualization crowded. | 我不觉得这张可视化拥挤。 |
| IMG-L3 | I don’t find distracting parts in this visualization. | 我不觉得这张可视化中存在令人分心的部分。 |

### DataRead / 信息读取

| ID | Validated English wording | 中文辅助翻译 |
|---|---|---|
| IMG-D1 | I can easily find specific elements in this visualization. | 我能轻松找到这张可视化中的特定元素。 |
| IMG-D2 | I can easily identify relevant information in this visualization. | 我能轻松识别这张可视化中的相关信息。 |
| IMG-D3 | I can easily retrieve information from this visualization. | 我能轻松地从这张可视化中获取信息。 |

### PREVis scoring / PREVis 计分

- 只有在一个子量表的全部题目均获得有效作答时才计分：分别计算 `IMG-U1–U3`、`IMG-L1–L3` 与 `IMG-D1–D3` 的均值，范围均为 1–7。该组任一题为 N/A 时，该参与者的对应子量表记为缺失。
- 不计算 9 题总平均，也不报告“总体 PREVis”。
- N/A 作为缺失值，不进行中点替代；报告各子量表的 N/A 比例。
- 分别报告三个子量表在本样本中的可靠性及 95% CI。

## P2. IGV-derived usefulness and beauty / IGV 衍生的有用性与美感

**Source / 来源：** Locoro, A., Cabitza, F., Ravarini, A., & Buono, P. (2020). IGV Short Scale to Assess Implicit Value of Visualizations through Explicit Interaction. *Applied Sciences, 10*(18), 6189. https://doi.org/10.3390/app10186189

### Measurement status / 测量状态

- 原研究在情境化的信息检索任务后，让参与者用 6 点量尺评价信息图的 `Usefulness`、`Intuitiveness`、`Clarity`、`Informativity`、`Beauty`，再单独评价整体价值。
- 本研究只保留 `Usefulness` 与 `Beauty` 两个单题。`Intuitiveness` 和 `Clarity` 与 PREVis 重叠，`Informativity` 与下方完整性题重叠，因此预先删除；不再加入 BeauVis。
- 论文只公布了五个英文维度标签、6 点端点及构念说明，没有公布实际施测页面的完整英文题干、简短定义或原始意大利语措辞。因此下方共同题干和双语释义是透明报告的语境适配，不应称为“逐字复现的已验证英文问卷”。
- 原研究对象是使用交互式医疗信息图完成信息检索的读者，而本研究是科研方法图作者评价自己的静态输出。因此这里应称 `two IGV-derived ratings in an adapted author context`；不能声称它们已在科研方法图作者自评中得到验证，也不能称为完整的 IGV short scale。

### Instructions and scale / 指导语与量尺

**EN (study-adapted common stem):** Considering the assigned scientific-communication task and source material, rate how much this figure appears to provide each of the following qualities.

**中文：** 结合指定的科研沟通任务与源材料，请评价该图在多大程度上看起来具备以下各项特征。

使用原研究的 6 点作答结构：界面提供 6 个位置，仅左、右端分别标注 `Very little / 非常少` 与 `Very much / 非常多`；后台编码为 1–6。中间四个位置不显示数值或语言标签，也没有中立中点。

| ID | Published label | 中文 | Study-adapted item |
|---|---|---|---|
| IMG-IGV-U | Usefulness | 有用性 | To what extent is this system-generated figure useful for communicating the method’s core components, relationships, and main contribution? / 这张由系统生成的科研图在多大程度上有助于传达方法的核心组件、相互关系与主要贡献？ |
| IMG-IGV-B | Beauty | 美感 | To what extent do the colors, icons, typography, and overall visual style form a coherent and appealing presentation? / 这张科研图的颜色、图标、字体与整体视觉风格在多大程度上形成了协调且具有吸引力的呈现？ |

### IGV scoring / IGV 计分

- 两个单题逐项报告，不计算两题均值或内部一致性，也不迁移原论文基于全部五个维度的预测公式。
- 不把 IGV-derived 题项与 PREVis 或下方三个研究适配题项合成一个图片质量总分。

## P3. Study-adapted scientific-content and structure ratings / 研究适配的科研内容与结构评分

**Sources / 来源：** Mondal et al. (2024) 的人工评价直接使用 `Completeness` 与 `Faithfulness`；DiagrammerGPT、DiagramEval 与 SciFlow-Bench 分别强调图文对齐、节点/路径关系和最终渲染图的结构可恢复性。

### Measurement status / 测量状态

- 以下三题是根据科研图生成评价框架改编的单题，不构成经过心理测量验证的量表。
- 作者自评的是对照任务说明与源材料后的**感知**忠实度、完整性与结构正确性，不等同于独立专家核验的客观正确性。
- 三题分别报告，不相加、不平均；`N/A` 按缺失值处理。

### Response scale and items / 作答量尺与题项

`1 = Not at all / 完全没有` 至 `5 = A great deal / 非常充分`；另设 `N/A = I cannot judge from the provided material / 无法根据所给材料判断`。

| ID | Dimension / 维度 | Study-adapted item / 研究适配题项 |
|---|---|---|
| IMG-SCI-F | Scientific Faithfulness / 科学忠实度 | To what extent does this figure faithfully and accurately represent the assigned method and source material, without unsupported or misleading content? / 这张科研图在多大程度上准确、忠实地表达了指定方法与源材料，且没有加入缺乏依据或可能造成误解的内容？ |
| IMG-SCI-C | Completeness / 完整性 | To what extent does this figure include the essential inputs, components, stages, outputs, and relationships needed to understand the assigned method? / 这张科研图在多大程度上包含了理解指定方法所必需的输入、组件、阶段、输出及其关系？ |
| IMG-SCI-S | Structural Correctness / 结构正确性 | To what extent do the components, arrows, and dependencies in this figure form a logically correct and coherent structure? / 这张科研图中的组件、箭头与依赖关系在多大程度上构成了逻辑正确且连贯的结构？ |

# Part E. Expert single-figure blind review / 专家单图盲评

专家评价不计入参与者的研究时长。3 位专家均须理解对应任务领域的科研表达，并具有 AI/CS 科研方法图的创作、审稿或系统评估经验。每位专家对匿名图片逐张独立评分，不进行 A/B 并排比较，也不评价图片是否“可以直接投稿”。

## E0. Figure presentation / 图片呈现

- 每次只展示一张最终静态图片、对应任务说明与源材料。
- 图片使用随机 `Figure_ID`，隐藏系统、参与者、条件顺序和操作日志。
- 所有图片使用相同显示尺寸、中性背景和相同查看工具；呈现顺序对每位专家随机化。
- 原则上由 3 位专家评价全部冻结图片。若工作量不允许，使用预先生成的平衡不完全分配，使每张图片获得相同数量的专家评分；不得依据成图质量或风格选择图片。
- 专家独立作答，不讨论后形成共识。全部评分冻结后才解盲系统条件。

## E1. Instructions, scale, and items / 指导语、量尺与题项

**EN:** Evaluate the single anonymous scientific figure currently displayed. Judge it only against the task brief and source material. Do not infer which system produced it. Select exactly one score for each item.

**中文：** 请评价当前展示的单张匿名科研图，并仅依据任务说明和源材料进行判断。请勿推测该图由哪个系统生成。每道题请选择一个分数。

| Score / 分数 | Meaning / 含义 |
|---:|---|
| 1 | Very poor; does not meet the criterion / 非常差；完全不符合该标准 |
| 2 | Poor; has major problems / 较差；存在严重问题 |
| 3 | Acceptable but with noticeable problems / 基本可接受，但存在明显问题 |
| 4 | Good; has only minor problems / 良好；仅有少量问题 |
| 5 | Excellent; fully meets the criterion / 非常好；完全符合该标准 |
| N/A | Cannot judge from the provided material / 无法根据所给材料判断 |

用户与专家评价相同的八个核心面向，但不逐字使用相同题目或相同量尺。专家题目为研究适配的单项评分，不是原版或经过验证的 PREVis/IGV 量表。

| ID | Dimension | English | 中文 |
|---|---|---|---|
| EXP-READ-U | Understandability | How easy is it to understand the intended reading path and the main method? | 这张图的预期阅读路径和主要方法是否容易理解？ |
| EXP-READ-L | Layout Readability | How clear and uncluttered is the layout, with minimal distracting elements? | 这张图的布局是否清晰、不拥挤，并且较少包含分散注意力的元素？ |
| EXP-READ-D | Information Retrieval | How easy is it to locate and retrieve relevant components and information? | 是否容易在这张图中定位并获取相关组件与信息？ |
| EXP-IGV-U | Usefulness | How useful is the figure for communicating the method's core components, relationships, and main contribution? | 这张图在多大程度上有助于传达方法的核心组件、相互关系与主要贡献？ |
| EXP-IGV-B | Beauty | How coherent and visually appealing are the colors, icons, typography, and overall style? | 这张图的颜色、图标、字体与整体风格是否协调且具有视觉吸引力？ |
| EXP-SCI-F | Scientific Faithfulness | How faithfully and accurately does the figure represent the assigned method and source material without unsupported or misleading content? | 这张图是否准确、忠实地表达指定方法与源材料，且没有缺乏依据或可能造成误解的内容？ |
| EXP-SCI-C | Completeness | How completely does the figure include the essential inputs, components, stages, outputs, and relationships? | 这张图是否完整包含理解指定方法所必需的输入、组件、阶段、输出及其关系？ |
| EXP-SCI-S | Structural Correctness | How logically correct and coherent are the components, arrows, and dependencies? | 这张图中的组件、箭头与依赖关系是否构成逻辑正确且连贯的结构？ |
| EXP-OV | Overall Quality | Overall, how well does the figure communicate the assigned scientific method accurately, completely, clearly, and effectively? | 综合来看，这张图是否能够准确、完整、清晰且有效地传达指定科研方法？ |

## E2. Prespecified expert analysis / 专家评价预设分析

- `EXP-OV` 为唯一专家主要终点；八个核心维度为次要诊断结果，对八项条件效应使用 Holm 校正。九题不相加或平均为“专家图片质量总分”。
- 每题使用有序混合效应模型比较 HiFigure 与 GPT Baseline。固定效应至少包括系统条件、任务、阶段及专家；随机效应包括 `Figure_ID` 和 `participant_id`，以处理同一图片由多位专家评分以及同一参与者产生两张图片的依赖。
- 主要报告系统条件的有序优势比、95% CI 和各评分等级的模型预测概率。若模型无法稳定估计，按预注册顺序先删除系统×任务交互，再删除 `participant_id` 随机效应；始终保留系统、任务、阶段、专家和 `Figure_ID`。
- `N/A` 按缺失处理，不作为量尺中点。按题项、任务和专家报告其比例；若任一题的 `N/A` 超过预注册阈值 10%，另行分析能否评分是否与系统或任务有关。
- 报告每题各分值的原始计数与比例，并在排除 `N/A` 后计算有序尺度 Krippendorff's α 及按 `Figure_ID` 重抽样的 bootstrap 95% CI，作为描述性专家一致性指标；一致性不用于检验系统优劣。
- 用户与专家结果仅按对应维度比较方向和模式，不直接合并分数。分析脚本在解盲前使用模拟数据完成检查并冻结。

**Method and evaluation sources / 方法与评价来源：**

- Hayes, A. F., & Krippendorff, K. (2007). Answering the call for a standard reliability measure for coding data. *Communication Methods and Measures, 1*(1), 77–89. https://doi.org/10.1080/19312450709336664
- Mondal, I., Li, Z., Hou, Y., Natarajan, A., Garimella, A., & Boyd-Graber, J. (2024). SciDoc2Diagrammer-MAF: Towards generation of scientific diagrams from documents guided by multi-aspect feedback refinement. *Findings of the Association for Computational Linguistics: EMNLP 2024*, 13342–13375. https://doi.org/10.18653/v1/2024.findings-emnlp.780
- Zala, A., Lin, H., Cho, J., & Bansal, M. (2024). DiagrammerGPT: Generating open-domain, open-platform diagrams via LLM planning. *Proceedings of COLM 2024*. https://openreview.net/forum?id=NV8yRJRET1
- Liang, C., & You, J. (2025). Evaluating LLM-generated diagrams as graphs. *Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing*, 12678–12690. https://doi.org/10.18653/v1/2025.emnlp-main.640
- Zhang, T., Lin, H., Liu, Z., Chen, C., & Zhang, W. (2026). SciFlow-Bench: Evaluating structure-aware scientific diagram generation via inverse parsing. *Proceedings of the 64th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, 17747–17765. https://doi.org/10.18653/v1/2026.acl-long.807
