# User Questionnaire / 用户问卷

本文件是用户问卷的题项母版。实际施测拆分为 [GPT Baseline 条件问卷](./questionnaire-user-baseline.md) 与 [HiFigure 条件问卷](./questionnaire-user-hifigure.md)：两套条件问卷使用相同的系统题和最终图片题；背景题只在研究开始时填写一次。`Envision`、`Externalize` 与 `Evolve` 三题在每个条件结束后立即评价，因此每位参与者对相同三个题号各产生两次作答，由 `condition` 区分。

## A. Study-specific Background Questions / 研究特定背景题

| ID | Question / 问题 | Response / 选项 |
|---|---|---|
| BG1 | What is your current academic or research role? / 您目前的学术或研究身份是什么？ | Undergraduate; Master’s; Doctoral; Postdoctoral; Faculty/researcher; Industry researcher/engineer / 本科生；硕士生；博士生；博士后；高校教师或研究人员；企业研究人员或工程师 |
| BG2 | Which area best describes your primary research or work? / 哪个领域最符合您的主要研究或工作方向？ | AI/ML; HCI/Scientific-figure design/Graphics; Systems/Software; Theory/Algorithms; Other computing; Non-computing / AI或机器学习；HCI/科研图设计/图形学；系统/软件；理论/算法；其他计算机领域；非计算机领域 |
| BG3 | During the past three months, how often did you read English-language AI or computer-science research papers? / 过去三个月中，您阅读英文 AI 或计算机科学论文的频率如何？ | Never; Less than monthly; 1–3/month; 1–3/week; ≥4/week / 从不；不足每月一次；每月1–3次；每周1–3次；每周至少4次 |
| BG4 | During the past 12 months, approximately how many scientific method, system, or pipeline figures did you create or substantially revise? / 过去12个月中，您大约制作或实质修改过多少张科研方法图、系统图或流程图？ | 0; 1–2; 3–5; 6–10; >10 |
| BG5 | Before this study, how often had you used generative AI to help create or substantially revise a scientific figure? / 在本研究之前，您使用生成式 AI 协助制作或实质修改科研图的频率如何？ | Never; 1–2 times; Less than monthly; 1–3/month; Weekly or more / 从不；1–2次；不足每月一次；每月1–3次；每周至少一次 |

## B. System Rating / 系统评分

### Creativity Support Index items

Scale: `0 = Highly disagree / 非常不同意` to `10 = Highly agree / 非常同意`.

| ID | Question / 问题 |
|---|---|
| SYS-CSI-E1 | It was easy for me to explore many different ideas, options, designs, or outcomes using `[SYSTEM]`. / 使用 `[SYSTEM]` 时，我能够轻松探索多种不同的想法、方案、设计或结果。 [R1] |
| SYS-CSI-E2 | `[SYSTEM]` was helpful in allowing me to track different ideas, outcomes, or possibilities. / `[SYSTEM]` 有助于我跟踪不同的想法、结果或可能性。 [R1] |
| SYS-CSI-X1 | I was able to be very creative while doing the activity inside `[SYSTEM]`. / 在 `[SYSTEM]` 中完成活动时，我能够充分发挥创造力。 [R1] |
| SYS-CSI-X2 | `[SYSTEM]` allowed me to be very expressive. / `[SYSTEM]` 使我能够充分表达自己的想法。 [R1] |
| SYS-CSI-R1 | I was satisfied with what I got out of `[SYSTEM]`. / 我对自己从 `[SYSTEM]` 中获得的成果感到满意。 [R1] |
| SYS-CSI-R2 | What I was able to produce was worth the effort I had to exert to produce it. / 我的产出值得我为此付出的努力。 [R1] |

### Study-specific 3E items / 研究特定的 3E 题项

Scale: `1 = Strongly disagree / 非常不同意` to `7 = Strongly agree / 非常同意`.

| Phase / 阶段 | ID | Question / 问题 |
|---|---|---|
| Envision | SYS-ENV1 | `[SYSTEM]` helped me clarify an initial visual direction for the scientific figure before I committed to a detailed design. / `[SYSTEM]` 帮助我在进入详细设计之前明确科研图的初步视觉方向。 [R2] |
| Externalize | SYS-EXT1 | `[SYSTEM]` helped me turn the scientific content into an inspectable structure of components, relationships, data flow, and reading order. / `[SYSTEM]` 帮助我将科研内容转化为可检查的组件、关系、数据流与阅读顺序结构。 [R3, R4, R5] |
| Evolve | SYS-EVO1 | `[SYSTEM]` allowed me to explore alternative figure candidates and choose which direction to develop further. / `[SYSTEM]` 允许我探索不同的科研图候选方案，并选择继续完善的方向。 [R10, R11] |

三题是 formative-study-derived、study-specific single items，不构成经过验证的量表。三题分别比较 HiFigure 与 GPT Baseline，并对三个条件效应使用 Holm 校正；不计算 3E 总分或内部一致性。

### Overall system usability / 整体系统可用性

Scale: `1 = Strongly disagree / 非常不同意` to `7 = Strongly agree / 非常同意`.

| ID | Question / 问题 |
|---|---|
| SYS-UX1 | `[SYSTEM]`’s capabilities meet my requirements. / `[SYSTEM]` 的功能满足我的需求。 [R6] |
| SYS-UX2 | `[SYSTEM]` is easy to use. / `[SYSTEM]` 易于使用。 [R6] |

### Sense of Ownership / 所有权感

Adapted from prior work on ownership in AI-mediated communication to the scientific-figure synthesis context. These are study-adapted items, not a validated standalone scale. / 根据 AI 中介沟通中的所有权感研究适配至科研图综合情境；这些是研究适配题项，不应称为经过验证的独立量表。

Scale: `1 = Not at all / 完全没有` to `5 = A great deal / 非常强烈`.

| ID | Question / 问题 |
|---|---|
| SYS-OW1 | To what extent do you feel that the final scientific figure you produced is yours? / 您在多大程度上觉得最终制作的科研图属于您自己的作品？ [adapted from R12, R13] |
| SYS-OW2 | To what extent does the final scientific figure reflect your own understanding of the assigned method and source material? / 最终科研图在多大程度上反映了您自己对指定方法与源材料的理解？ [adapted from R12, R13] |

### User Agency / 用户能动性

Adapted from prior process-control and outcome-control items in AI-mediated communication. / 根据 AI 中介沟通中的过程控制与结果控制题项进行情境适配。

Scale: `1 = Not at all / 完全没有` to `5 = A great deal / 非常强烈`.

| Construct / 构念 | ID | Question / 问题 |
|---|---|---|
| Process Control / 过程控制 | SYS-PC1 | How much control did you feel over the process of organizing, understanding, and visually synthesizing the source material? / 在组织、理解并以视觉方式综合源材料的过程中，您感到自己有多大控制力？ [adapted from R12, R13] |
| Outcome Control / 结果控制 | SYS-OC1 | How much control did you feel over the final figure you produced? / 对于最终制作的科研图，您感到自己有多大控制力？ [adapted from R12, R13] |

### Short-form workload items / 简短工作负荷题项

The two single-item ratings assess related but distinct aspects of overall cognitive load and should be reported separately rather than combined into a scale score. / 两个单题分别测量整体认知负荷中相关但不同的方面，应分别报告，不应合并为一个量表总分。 [R7, R14]

| ID | Construct / 构念 | Question / 问题 | Scale / 量尺 |
|---|---|---|---|
| SYS-WL1 | Mental Effort / 心智努力 | How much mental effort did you invest in completing `[TASK]` with `[SYSTEM]`? / 您使用 `[SYSTEM]` 完成 `[TASK]` 时投入了多少心智努力？ | `1 = Very, very low / 非常非常低` to `9 = Very, very high / 非常非常高` [R7, R14] |
| SYS-WL2 | Task Difficulty / 任务难度 | How difficult did you find this scientific-figure synthesis task? / 您认为这项科研图综合任务有多困难？ | `1 = Very, very easy / 非常非常容易` to `9 = Very, very difficult / 非常非常困难` [R14] |

## C. Final Figure Rating / 最终图片评分

**Instructions / 指导语：** Rate only the final static figure currently displayed, against the task brief and source material. Ignore how the figure was created and how easy the system was to use. Your responses describe your own perception and do not establish independently verified scientific correctness. / 请只评价当前显示的最终静态科研图，并对照任务说明与源材料作答。不要考虑图片的生成过程或系统是否易用。您的回答反映个人感知，不等同于经过独立核验的科学正确性。

### PREVis

Scale: `1 = Strongly disagree / 非常不同意` to `7 = Strongly agree / 非常同意`; `N/A = I don't know or not applicable / 不知道或不适用`.

| ID | Question / 问题 |
|---|---|
| IMG-U1 | It is obvious for me how to read this visualization. / 我一眼就知道应该如何阅读这张科研图。 [R8] |
| IMG-U2 | I can easily understand how the data is represented in this visualization. / 我能轻松理解数据在这张科研图中是如何呈现的。 [R8] |
| IMG-U3 | I can easily understand this visualization. / 我能轻松理解这张科研图。 [R8] |
| IMG-L1 | I don't find this visualization messy. / 我不觉得这张科研图杂乱。 [R8] |
| IMG-L2 | I don't find this visualization crowded. / 我不觉得这张科研图拥挤。 [R8] |
| IMG-L3 | I don’t find distracting parts in this visualization. / 我不觉得这张科研图中存在令人分心的部分。 [R8] |
| IMG-D1 | I can easily find specific elements in this visualization. / 我能轻松找到这张科研图中的特定元素。 [R8] |
| IMG-D2 | I can easily identify relevant information in this visualization. / 我能轻松识别这张科研图中的相关信息。 [R8] |
| IMG-D3 | I can easily retrieve information from this visualization. / 我能轻松地从这张科研图中获取信息。 [R8] |

### IGV-derived usefulness and beauty ratings

These two single-item ratings retain the two non-redundant IGV dimensions most relevant to this study. They are reported separately and are not combined with PREVis or the content-quality items below. / 这两个单题保留了与本研究最相关、且与 PREVis 重叠较少的两个 IGV 维度。两题分别报告，不与 PREVis 或下方内容质量题项合并计分。

| Score / 分值 | Response anchor / 作答锚点 |
|---:|---|
| 1 | Very little / 非常少 |
| 2 |  |
| 3 |  |
| 4 |  |
| 5 |  |
| 6 | Very much / 非常多 |

| ID | Dimension / 维度 | Question / 问题 |
|---|---|---|
| IMG-IGV-U | Usefulness / 有用性 | To what extent is this system-generated figure useful for communicating the method’s core components, relationships, and main contribution? / 这张由系统生成的科研图在多大程度上有助于传达方法的核心组件、相互关系与主要贡献？ [R9] |
| IMG-IGV-B | Beauty / 美感 | To what extent do the colors, icons, typography, and overall visual style form a coherent and appealing presentation? / 这张科研图的颜色、图标、字体与整体视觉风格在多大程度上形成了协调且具有吸引力的呈现？ [R9] |

### Study-adapted scientific-content and structure ratings / 研究适配的科研内容与结构评分

These are study-adapted single items informed by prior evaluation frameworks for scientific-diagram generation. They are not a validated scale. The participant rates perceived quality against the task brief and source material; these ratings do not establish independently verified correctness. / 以下是参考科研图生成评价框架设计的研究适配单题，不属于经过验证的量表。参与者对照任务说明与源材料评价自己感知到的质量；这些评分不等同于经过独立核验的客观正确性。 [R4, R15–R17]

Scale: `1 = Not at all / 完全没有` to `5 = A great deal / 非常充分`; `N/A = I cannot judge from the provided material / 无法根据所给材料判断`.

| ID | Dimension / 维度 | Question / 问题 |
|---|---|---|
| IMG-SCI-F | Scientific Faithfulness / 科学忠实度 | To what extent does this figure faithfully and accurately represent the assigned method and source material, without unsupported or misleading content? / 这张科研图在多大程度上准确、忠实地表达了指定方法与源材料，且没有加入缺乏依据或可能造成误解的内容？ [R15] |
| IMG-SCI-C | Completeness / 完整性 | To what extent does this figure include the essential inputs, components, stages, outputs, and relationships needed to understand the assigned method? / 这张科研图在多大程度上包含了理解指定方法所必需的输入、组件、阶段、输出及其关系？ [R15] |
| IMG-SCI-S | Structural Correctness / 结构正确性 | To what extent do the components, arrows, and dependencies in this figure form a logically correct and coherent structure? / 这张科研图中的组件、箭头与依赖关系在多大程度上构成了逻辑正确且连贯的结构？ [R4, R16, R17] |

Report the three items separately. Do not average them into a “validated scientific-figure quality scale,” and treat `N/A` as missing rather than as the midpoint. / 三题分别报告；不得将其平均后称为“经过验证的科研图质量量表”，`N/A` 应按缺失值处理，不能替代为量尺中点。

## References

- [R1] Cherry, E., & Latulipe, C. (2014). Quantifying the Creativity Support of Digital Tools through the Creativity Support Index. *ACM Transactions on Computer-Human Interaction, 21*(4), Article 21. https://doi.org/10.1145/2617588
- [R2] Gentner, D. (1983). Structure-mapping: A theoretical framework for analogy. *Cognitive Science, 7*(2), 155–170. https://doi.org/10.1207/s15516709cog0702_3
- [R3] Schön, D. A. (1992). Designing as reflective conversation with the materials of a design situation. *Knowledge-Based Systems, 5*(1), 3–14. https://doi.org/10.1016/0950-7051(92)90020-G
- [R4] Zala, A., Lin, H., Cho, J., & Bansal, M. (2024). DiagrammerGPT: Generating open-domain, open-platform diagrams via LLM planning. *Proceedings of COLM 2024*. https://openreview.net/forum?id=NV8yRJRET1
- [R5] Larkin, J. H., & Simon, H. A. (1987). Why a diagram is (sometimes) worth ten thousand words. *Cognitive Science, 11*(1), 65–100. https://doi.org/10.1111/j.1551-6708.1987.tb00863.x
- [R6] Lewis, J. R., Utesch, B. S., & Maher, D. E. (2013). UMUX-LITE: When there’s no time for the SUS. *Proceedings of CHI ’13*, 2099–2102. https://doi.org/10.1145/2470654.2481287
- [R7] Paas, F. (1992). Training strategies for attaining transfer of problem-solving skill in statistics: A cognitive-load approach. *Journal of Educational Psychology, 84*(4), 429–434. https://doi.org/10.1037/0022-0663.84.4.429
- [R8] Cabouat, A.-F., He, T., Isenberg, P., & Isenberg, T. (2025). PREVis: Perceived Readability Evaluation for Visualizations. *IEEE Transactions on Visualization and Computer Graphics, 31*(1), 1083–1093. https://doi.org/10.1109/TVCG.2024.3456318
- [R9] Locoro, A., Cabitza, F., Ravarini, A., & Buono, P. (2020). IGV Short Scale to Assess Implicit Value of Visualizations through Explicit Interaction. *Applied Sciences, 10*(18), 6189. https://doi.org/10.3390/app10186189
- [R10] Amershi, S., Weld, D., Vorvoreanu, M., Fourney, A., Nushi, B., Collisson, P., Suh, J., Iqbal, S., Bennett, P. N., Inkpen, K., Teevan, J., Kikin-Gil, R., & Horvitz, E. (2019). Guidelines for human–AI interaction. *Proceedings of CHI ’19*, Paper 3, 1–13. https://doi.org/10.1145/3290605.3300233
- [R11] Wang, Z., Huang, Y., Song, D., Ma, L., & Zhang, T. (2024). PromptCharm: Text-to-image generation through multi-modal prompting and refinement. *Proceedings of CHI ’24*, Article 185, 1–21. https://doi.org/10.1145/3613904.3642803
- [R12] Kadoma, K., Aubin Le Quéré, M., Fu, X. J., Munsch, C., Metaxa, D., & Naaman, M. (2024). The role of inclusion, control, and ownership in workplace AI-mediated communication. *Proceedings of the CHI Conference on Human Factors in Computing Systems*, Article 1016, 1–10. https://doi.org/10.1145/3613904.3642650
- [R13] Mieczkowski, H. N. (2022). *AI-mediated communication: Examining agency, ownership, expertise, and roles of AI systems* [Doctoral dissertation, Stanford University]. ProQuest Dissertations & Theses Global. https://www.proquest.com/dissertations-theses/ai-mediated-communication-examining-agency/docview/2734696274/se-2
- [R14] Schuessler, K., Fischer, V., & Walpuski, M. (2025). Investigating construct validity of cognitive load measurement using single-item subjective rating scales. *Instructional Science, 53*, 71–97. https://doi.org/10.1007/s11251-024-09692-6
- [R15] Mondal, I., Li, Z., Hou, Y., Natarajan, A., Garimella, A., & Boyd-Graber, J. (2024). SciDoc2Diagrammer-MAF: Towards generation of scientific diagrams from documents guided by multi-aspect feedback refinement. *Findings of the Association for Computational Linguistics: EMNLP 2024*, 13342–13375. https://doi.org/10.18653/v1/2024.findings-emnlp.780
- [R16] Liang, C., & You, J. (2025). Evaluating LLM-generated diagrams as graphs. *Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing*, 12678–12690. https://doi.org/10.18653/v1/2025.emnlp-main.640
- [R17] Zhang, T., Lin, H., Liu, Z., Chen, C., & Zhang, W. (2026). SciFlow-Bench: Evaluating structure-aware scientific diagram generation via inverse parsing. *Proceedings of the 64th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, 17747–17765. https://doi.org/10.18653/v1/2026.acl-long.807
