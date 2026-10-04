# 2026 LLM-related methodology task catalog

This catalog records the six source papers and the corresponding HiFigure task instructions. Each task is an independent research idea inspired by the cited paper; it is not a claim that every task module appears in the source paper.

The task instructions are intentionally content-only. They describe a compact four-module method, three important components per module, two internal steps per module, and three end-to-end relationships. They contain no diagram layout, visual style, color, icon, typography, or rendering instructions.

Metadata verified on 2026-08-15 against ACL Anthology, CVF Open Access, ICLR, or OpenReview.

## Paper metadata

| Direction | HiFigure task | Source-paper title | Venue | Link |
|---|---|---|---|---|
| NLP | RouteFuse-RAG: Adaptive Cross-modal Evidence Routing | UniversalRAG: Retrieval-Augmented Generation over Corpora of Diverse Modalities and Granularities | ACL 2026 · Long Papers | [ACL Anthology](https://aclanthology.org/2026.acl-long.177/) |
| NLP | PlanExec-Agent: Decoupled Planning and Tool Execution | OctoTools: A Multi-Agent Framework with Extensible Tools for Complex Reasoning | ACL 2026 · Long Papers | [ACL Anthology](https://aclanthology.org/2026.acl-long.1/) |
| CV | SemBridge: Semantic-Spatial Conditioning for Diffusion | WeMMU: Enhanced Bridging of Vision-Language Models and Diffusion Models via Noisy Query Tokens | CVPR 2026 | [CVF Open Access](https://openaccess.thecvf.com/content/CVPR2026/html/Yang_WeMMU_Enhanced_Bridging_of_Vision-Language_Models_and_Diffusion_Models_via_CVPR_2026_paper.html) |
| CV | ActiveView-VLA: Uncertainty-guided Embodied Perception | SaPaVe: Towards Active Perception and Manipulation in Vision-Language Action Models for Robotics | CVPR 2026 | [CVF Open Access](https://openaccess.thecvf.com/content/CVPR2026/html/Liu_SaPaVe_Towards_Active_Perception_and_Manipulation_in_Vision-Language_Action_Models_CVPR_2026_paper.html) |
| RL / ML | DreamCurriculum-RL: Curated Synthetic Experience for LLM Agents | Scaling Agent Learning via Experience Synthesis | ICLR 2026 · Poster | [OpenReview](https://openreview.net/forum?id=cf7qpBwttr) · [ICLR page](https://iclr.cc/virtual/2026/poster/10008483) |
| RL / ML | CognitiveRouter: A Mixture of Specialized LLM Reasoners | Mixture of Cognitive Reasoners: Modular Reasoning with Brain-Like Specialization | ICLR 2026 | [OpenReview](https://openreview.net/forum?id=m3jztlHDmG) |

## Task instructions

### NLP · RouteFuse-RAG: Adaptive Cross-modal Evidence Routing

- Topic: Cross-modal multi-granularity RAG
- Source paper: UniversalRAG: Retrieval-Augmented Generation over Corpora of Diverse Modalities and Granularities
- Venue: ACL 2026 · Long Papers
- Link: [ACL Anthology](https://aclanthology.org/2026.acl-long.177/)

```text
METHOD OVERVIEW
A query-aware RAG system selects text, page-region, and table/figure retrievers, merges their evidence into a cited context, and returns an answer only when its claims are supported.

REQUIRED MODULES
1. Query Router: Choose evidence sources and a top-k budget from the query. Components: modality and granularity analyzer, expert gate, budget allocator.
2. Retrieval Bank: Search the selected sources and preserve provenance. Components: passage retriever, page-region retriever, table/figure retriever.
3. Evidence Builder: Produce one compact, non-redundant cited context. Components: cross-modal reranker, deduplicator, citation packer.
4. Answer Guard: Generate the answer and enforce claim support. Components: answer generator, support checker, repair and abstention gate.

MODULE INTERNALS AND STEPS
Query Router: extract retrieval cues -> output active experts and top-k values.
Retrieval Bank: search each active index -> return ranked evidence with source IDs.
Evidence Builder: rerank and merge candidates -> pack evidence with citation IDs.
Answer Guard: draft and check cited claims -> return, repair retrieval once, or abstain.

END-TO-END METHOD
1. The Query Router outputs active retrievers and top-k values.
2. The Retrieval Bank returns sourced candidates, and the Evidence Builder turns them into a cited context.
3. The Answer Guard returns a supported answer; otherwise it requests one retrieval repair and then abstains if support is still insufficient.
```

### NLP · PlanExec-Agent: Decoupled Planning and Tool Execution

- Topic: Planner-executor tool agent
- Source paper: OctoTools: A Multi-Agent Framework with Extensible Tools for Complex Reasoning
- Venue: ACL 2026 · Long Papers
- Link: [ACL Anthology](https://aclanthology.org/2026.acl-long.1/)

```text
METHOD OVERVIEW
A modular LLM agent turns an objective into an ordered plan, binds ready steps to valid tool calls, records tool results in shared state, and performs one bounded repair before answering.

REQUIRED MODULES
1. Grounded Planner: Create an ordered plan from the objective, constraints, and tool registry. Components: constraint extractor, subgoal graph, tool capability index.
2. Tool Executor: Bind each ready subgoal to a safe, schema-valid call. Components: tool selector, schema validator, controlled runtime.
3. Observation Memory: Convert tool outputs into reusable state with provenance. Components: result normalizer, working memory, provenance ledger.
4. Verifier and Synthesizer: Check goal coverage and produce the final response. Components: goal checker, repair gate, response synthesizer.

MODULE INTERNALS AND STEPS
Grounded Planner: extract constraints and available capabilities -> output dependency-ordered subgoals.
Tool Executor: select and validate a tool call -> execute it and record status.
Observation Memory: normalize the tool result -> update state with source and status.
Verifier and Synthesizer: compare completed state with the plan -> repair one failed subgoal or synthesize the response.

END-TO-END METHOD
1. The Grounded Planner outputs dependency-ordered subgoals.
2. For each ready subgoal, the Tool Executor records a validated result in Observation Memory.
3. The Verifier and Synthesizer repairs at most one failed subgoal, then returns the response or reports the unresolved failure.
```

### CV · SemBridge: Semantic-Spatial Conditioning for Diffusion

- Topic: VLM-guided diffusion bridge
- Source paper: WeMMU: Enhanced Bridging of Vision-Language Models and Diffusion Models via Noisy Query Tokens
- Venue: CVPR 2026
- Link: [CVF Open Access](https://openaccess.thecvf.com/content/CVPR2026/html/Yang_WeMMU_Enhanced_Bridging_of_Vision-Language_Models_and_Diffusion_Models_via_CVPR_2026_paper.html)

```text
METHOD OVERVIEW
A frozen vision-language model extracts entities, attributes, relations, and coarse positions; a bridge injects these signals into matching diffusion scales, while a training-only critic scores semantic and spatial agreement.

REQUIRED MODULES
1. Multimodal Semantic Parser: Convert text and an optional image into structured generation signals. Components: text-image encoder, entity and attribute parser, relation and position parser.
2. Semantic-Spatial Bridge: Map parsed signals to diffusion-compatible controls. Components: semantic projector, spatial encoder, scale adapter.
3. Conditioned Diffusion Generator: Generate an image using scale-matched controls. Components: denoising backbone, condition injectors, image decoder.
4. Training Consistency Critic: Supervise semantic and spatial fidelity during training only. Components: semantic score, spatial score, consistency loss.

MODULE INTERNALS AND STEPS
Multimodal Semantic Parser: encode the available modalities -> output entities, attributes, relations, and coarse positions.
Semantic-Spatial Bridge: project semantic and spatial signals -> assign them to coarse, middle, or fine scales.
Conditioned Diffusion Generator: inject controls at their assigned scales -> denoise and decode the image.
Training Consistency Critic: compare the generated image with parsed signals -> return the combined training loss.

END-TO-END METHOD
1. The Multimodal Semantic Parser outputs entities, attributes, relations, and coarse positions.
2. The Semantic-Spatial Bridge assigns these signals to matching diffusion scales, and the generator produces the image.
3. During training only, the Consistency Critic returns semantic and spatial loss to update the bridge and generator.
```

### CV · ActiveView-VLA: Uncertainty-guided Embodied Perception

- Topic: Active-perception VLA
- Source paper: SaPaVe: Towards Active Perception and Manipulation in Vision-Language Action Models for Robotics
- Venue: CVPR 2026
- Link: [CVF Open Access](https://openaccess.thecvf.com/content/CVPR2026/html/Liu_SaPaVe_Towards_Active_Perception_and_Manipulation_in_Vision-Language_Action_Models_CVPR_2026_paper.html)

```text
METHOD OVERVIEW
A vision-language-action agent tracks objects and uncertainty, selects one feasible viewpoint with the highest expected information gain, updates memory from the new observation, and executes a safety-checked task action.

REQUIRED MODULES
1. Instruction-aware Scene Memory: Maintain object, temporal, and uncertainty state from language and vision. Components: language-vision encoder, object memory, uncertainty map.
2. Active View Controller: Acquire the feasible view with the largest expected uncertainty reduction. Components: candidate-view sampler, information-gain scorer, feasibility mask.
3. Evidence Integrator: Merge the refreshed observation into persistent state. Components: observation aligner, memory updater, confidence updater.
4. Safe Task Policy: Choose and validate the embodied task action. Components: language-conditioned policy, action head, safety checker.

MODULE INTERNALS AND STEPS
Instruction-aware Scene Memory: fuse the instruction and current observation -> update objects and uncertain regions.
Active View Controller: score feasible views under the sensing budget -> execute the highest-scoring view.
Evidence Integrator: align the new observation with stored objects -> update memory and confidence.
Safe Task Policy: propose an action from updated memory -> execute it only if the safety check passes.

END-TO-END METHOD
1. Instruction-aware Scene Memory identifies objects and uncertain regions.
2. The Active View Controller acquires the feasible view with maximum expected information gain, and the Evidence Integrator updates memory.
3. The Safe Task Policy executes an action only after the safety check passes.
```

### RL / ML · DreamCurriculum-RL: Curated Synthetic Experience for LLM Agents

- Topic: Synthetic experience agent RL
- Source paper: Scaling Agent Learning via Experience Synthesis
- Venue: ICLR 2026 · Poster
- Link: [OpenReview](https://openreview.net/forum?id=cf7qpBwttr) · [ICLR page](https://iclr.cc/virtual/2026/poster/10008483)

```text
METHOD OVERVIEW
An agent-training loop creates skill-targeted tasks, collects simulated trajectories with the current policy, filters invalid or redundant experience, updates the policy, and sets the next task difficulty from held-out evaluation.

REQUIRED MODULES
1. Curriculum Designer: Generate task specifications for selected skills and difficulty. Components: skill inventory, task synthesizer, difficulty controller.
2. Simulation and Rollout: Collect synthetic trajectories with the current policy. Components: world and user simulator, current policy, trajectory buffer.
3. Experience Curator: Keep valid, distinct, and balanced trajectories. Components: validity filter, deduplicator, skill and difficulty balancer.
4. Learning and Evaluation Controller: Update the policy and choose the next curriculum settings. Components: outcome judge, policy optimizer, held-out skill evaluator.

MODULE INTERNALS AND STEPS
Curriculum Designer: select target skills and difficulty -> output task specifications with constraints.
Simulation and Rollout: simulate responses to policy actions -> store complete trajectories.
Experience Curator: reject invalid and duplicate trajectories -> balance retained data by skill and difficulty.
Learning and Evaluation Controller: score curated trajectories and update the policy -> set next-round skills and difficulty from evaluation gaps.

END-TO-END METHOD
1. The Curriculum Designer outputs skill- and difficulty-controlled task specifications.
2. Simulation and Rollout collects trajectories, and the Experience Curator returns a valid, distinct, balanced training set.
3. The Learning and Evaluation Controller updates the policy and feeds measured skill gaps into the next curriculum round.
```

### RL / ML · CognitiveRouter: A Mixture of Specialized LLM Reasoners

- Topic: Mixture of cognitive reasoners
- Source paper: Mixture of Cognitive Reasoners: Modular Reasoning with Brain-Like Specialization
- Venue: ICLR 2026
- Link: [OpenReview](https://openreview.net/forum?id=m3jztlHDmG)

```text
METHOD OVERVIEW
A meta-controller splits a problem and routes each part to analytic, retrieval, tool/simulation, or reflective reasoners; a shared workspace combines sourced proposals, and a verifier permits one targeted reroute before answering.

REQUIRED MODULES
1. Cognitive Meta-controller: Decompose the problem and assign compute-limited reasoning routes. Components: subproblem decomposer, reasoner gate, compute scheduler.
2. Specialized Reasoner Pool: Produce complementary proposals for routed subproblems. Components: analytic reasoner, retrieval reasoner, tool/simulation and reflective reasoners.
3. Shared Deliberation Workspace: Compare proposals and resolve conflicts without hiding their sources. Components: evidence board, conflict map, proposal aggregator.
4. Answer Verifier: Apply consistency, evidence, and stopping checks. Components: consistency checker, evidence checker, reroute and answer gate.

MODULE INTERNALS AND STEPS
Cognitive Meta-controller: form subproblems and estimate their demands -> output reasoner assignments and round budgets.
Specialized Reasoner Pool: run each assigned reasoner -> return a proposal with evidence and confidence.
Shared Deliberation Workspace: mark support, agreement, and conflict -> merge compatible proposals with provenance.
Answer Verifier: check the merged proposal -> answer, or reroute one unresolved subproblem once.

END-TO-END METHOD
1. The Cognitive Meta-controller outputs subproblem-to-reasoner assignments and round budgets.
2. The Specialized Reasoner Pool writes evidence-bearing proposals to the Shared Deliberation Workspace for conflict-aware aggregation.
3. The Answer Verifier returns the answer if checks pass; otherwise it reroutes one unresolved subproblem once before stopping.
```
