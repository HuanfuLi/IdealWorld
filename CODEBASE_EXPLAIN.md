# Ideal World (理想世界) 代码库结构与逻辑详解

本文档旨在帮助人类开发者快速理解 Ideal World 项目的代码结构、核心模拟工作流（设计、模拟、反思等），以及配置（AI提示词、模型、数据、UI配置）的具所在位置。

## 1. 项目架构概览

Ideal World 是一个使用全本地化技术栈的大型多智能体(Multi-Agent)微观社会模拟平台。该应用不需要云端服务器，其数据和核心运算都在用户本地运行。

*   **架构类型**: Monorepo (使用 npm workspaces)
*   **前端 (`web/`)**: React 19 + TypeScript + Zustand + TailwindCSS + Vite。它主要通过轮询与 SSE (Server-Sent Events) 来和后端进行通信。
*   **后端 (`server/`)**: Node.js + Express + TypeScript。后端处理协调、数据库操作，以及管理对 LLM (大型语言模型) 的 API 请求。
*   **共享库 (`shared/`)**: 包含前端与后端共享的 TypeScript 类型定义、数据结构、验证器和常量。

### 核心运作机制：两大核心智能体类型

1.  **Central Agent (中央智能体)**：这是一个无所不知的管理员智能体。它负责与人类用户一起“头脑风暴”设定社会规则，生成宪法，设计并生成所有市民（Citizen Agents）。在模拟循环中，它负责裁决冲突，管理生死，更新状态，总结每一回合的故事。
2.  **Citizen Agents (市民智能体)**：独立的个体智能体（20~150+个），每个人有独特的背景和初始属性。在模拟循环中，它们只负责输出**意图 (Intents)**，它们不能直接修改自己的属性，结果均由 Central Agent 裁定。

---

## 2. 核心模拟工作流 (Core Simulation Workflow)

项目的生命周期被分为若干阶段 (Stages)，代码按照这些阶段进行了很好的模块化划分。

### 2.1 阶段 1：社会设计 (Design Phase)
*   **交互逻辑**：人类用户输入基础构思 (Seed Idea)。Central Agent 会通过一个“头脑风暴”界面 (Stage 1A) 和用户对话，直到收集到治理、经济、法律、文化和基础设施的所有所需要素。
*   **代码位置**：`server/src/orchestration/designOrchestrator.ts` 以及 `server/src/llm/centralAgent.ts`
*   **执行过程**：一旦信息收集完毕，Central Agent 将执行一系列连续的 LLM 调用 (Stage 1B) 来生成：
    1.  社会概览 (Overview) 和时间尺度 (Time Scale)
    2.  虚拟法律文档 (Law Document)
    3.  市民名单与初始状态 (Agent Roster & Stats)

### 2.2 阶段 2：核心模拟循环 (Simulation Loop)
这是本系统最具技术含量的模块。它使用了一个“意图 (并发) -> 裁决 (串行 / Map-Reduce)” 的两阶段物理/逻辑引擎混合执行模型。
*   **代码位置**：`server/src/orchestration/simulationRunner.ts`
*   **物理引擎位置**：`server/src/mechanics/physicsEngine.ts` 与 `actionCodes.ts` (硬编码了诸如 WORK, STEAL, TRADE 等操作导致的确切数值变化机制)
*   **循环步骤 (每一回合 / Iteration)**:
    1.  **收集意图 (Intent Phase)**：遍历所有活着的 Citizen Agents，通过并发的 LLM 请求获取每个人这回合想干什么（输出意图、原因和硬编码的 `ActionCode`）。并发数由系统配置决定以避免 Rate Limit。
    2.  **Central Agent 裁决 (Resolution Phase)**：
        *   **Standard Path (<=30 人)**：将所有意图聚合给 Central Agent，要求其编写一个连贯的故事，并指出谁可能死亡。
        *   **Map-Reduce Path (>30 人)**：为了防止上下文窗口超载，系统使用 `server/src/orchestration/clustering.ts` 按照角色 (Role) 将人群聚类分组（比如农民一组，商人一组）。每组由一个局部的协调器 LLM 进行预演合并，最后再由 Central Agent 统一合并所有子组的结果 (Merge Step)，生成全局总结。
    3.  **应用物理学与状态变更**：基于 LLM 返回的意图和 Action Code，调用 `resolveAction` 计算确切的财富、健康、幸福、压力(Cortisol)、满足感(Dopamine) 变化。应用状态并保存到数据库。
    4.  **推送数据**：通过 SSE (`simulationManager.broadcast`) 将这一迭代的故事、数据发送给前端进行 UI 渲染。

### 2.3 阶段 3 & 4：反思与总结 (Reflection & Review)
*   **代码位置**：`server/src/orchestration/reflectionRunner.ts`
*   **Two-pass Reflection (双向反思)**：
    1.  **Pass 1**: 让每个 Citizen Agent 基于自己经历的所有 iteration 回顾一生。
    2.  **Evaluation**: Central Agent 根据所有市民的 Pass 1 评价和历史记录，生成一份社会整体评价报告 (Society Evaluation)。
    3.  **Pass 2**: 将这份上帝视角的 Evaluation 交回给每个 Citizen Agent，询问他们在得知全部真相后的态度变化。
*   **审讯 (Stage 4)**: 用户可以点开任何一个活着的或者死去的 Citizen Agent 的聊天窗口，对其进行采访 (`server/src/routes/review.ts`)。

---

## 3. 核心配置与提示词 (Prompts & LLM Configs) 位置

如果需要修改 AI 的行为逻辑、身份设定或是返回的数据结构，请直接查看这些文件。

### 3.1 提示词工厂 (Prompts)
系统内所有的 LLM Prompt 都被剥离成了纯函数，集中在一个文件中：
*   **文件位置**: `server/src/llm/prompts.ts`
*   **内容说明**:
    *   `buildBrainstormMessages`: 头脑风暴时的 Central Agent 人设和追问逻辑。
    *   `buildOverviewMessages` / `buildLawMessages` / `buildAgentRosterMessages`: 用于生成社会背景、法律、市民列表的核心模板。
    *   `buildIntentPrompt`: **极其核心！** 这是决定 Citizen Agent 每一回合如何思考的提示词。它包含了压力系统（Cortisol/Dopamine 导致的行为变形），并要求 Agent 输出 `actionCode` 供物理引擎解析。
    *   `buildResolutionPrompt` (及对应的 Map-Reduce Prompt): Central Agent 如何裁定事件。
    *   `buildAgentReflectionPrompt`: 市民一生的反思提示词。

### 3.2 物理引擎与机制参数 (Game Mechanics)
系统的数值增长逻辑（不完全依赖大模型胡编乱造，而是混合了符号计算）：
*   **文件位置**: `server/src/mechanics/physicsEngine.ts` 和 `server/src/mechanics/actionCodes.ts`
*   **内容说明**: 包含 `WORK`, `REST`, `STEAL` 等动作导致生命、财富、压力的固定数学公式。如果想修改“偷窃扣多少血”或“休息回多少压力”，修改此处。

### 3.3 LLM 网关与提供商 (LLM Gateway)
项目使用了一个统一的提供商抽象层，支持本地与云端模型。
*   **文件位置**: `server/src/llm/gateway.ts`, `server/src/llm/anthropic.ts`, `server/src/llm/openai.ts`
*   **配置说明**: 支持 Anthropic 官方 API，以及兼容 OpenAI 格式的 API（如本地的 LM Studio 或 Ollama）。在 `anthropic.ts` 中还可以看到针对 Claude 的 `cache_control` (Prompt Caching) 的特殊支持。

---

## 4. UI 界面与前端配置

前端的大部分状态和样式都不依赖复杂的外部配置文件，而是直接内联或者写在特定的全局样式表中。

### 4.1 全局主题与颜色 (Colors, Fonts, Layouts)
*   **文件位置**: `web/src/index.css`
*   **内容说明**:
    *   这是 CSS 变量的主阵地！所有的颜色基调（Dark mode 默认，支持 Light mode）、玻璃拟态 (Glassmorphism) 参数、高光、阴影都在这里以 `:root` CSS variables 的形式定义（如 `--bg-color`, `--primary`, `--glass-bg`）。
    *   字体设置：`--font-family: 'Inter', -apple-system, ...`
    *   如果你需要调整系统主色调，直接修改这里的 `--primary` 或背景 `--bg-gradient` 即可。
*   **文件位置**: `web/src/App.css`
*   **内容说明**: 包含整体的主结构布局逻辑（侧边栏宽度、主要的 Dashboard 网格布局规范等）。

### 4.2 前端状态管理 (Zustand Stores)
为了避免 React re-renders 问题，业务状态被细粒度拆分到了不同的 Store 中：
*   **文件位置**: `web/src/stores/` (例如 `simulationStore.ts`, `sessionDetailStore.ts`, `settingsStore.ts`)
*   **内容说明**: 所有的网络请求 (API calls) 和 SSE (Server-Sent Events) 监听器都在这里建立，进而触发 React UI 更新。

### 4.3 核心组件 UI (Components)
*   **图表渲染**: `web/src/components/LineChart.tsx` (使用原生的 SVG 绘制社会的财富/健康趋势折线图，没有使用第三方重型库)。
*   **视图页面**: 都在 `web/src/pages/` 目录下，比如 `Simulation.tsx` (核心模拟运行面板), `Reflection.tsx` 等。

---

## 5. 数据持久化与数据库 (Database & Storage)

*   **数据存储位置**: 用户主目录下的 `.idealworld` 文件夹。
    *   **Mac/Linux**: `~/.idealworld/idealworld.db`
    *   **Windows**: `C:\Users\Username\.idealworld\idealworld.db`
    *   应用的 API Key 配置文件也存放在该目录下：`~/.idealworld/config.json` (相关代码见 `server/src/settings.ts`)
*   **ORM 与 数据模式 (Schema)**:
    *   **文件位置**: `server/src/db/schema.ts`
    *   使用 Drizzle ORM，结合 SQLite 的 WAL 模式（以支持高并发读写）。
    *   核心表包括：`sessions`, `agents`, `agent_intents`, `resolved_actions`, `iterations`, `reflections` 等。
*   **日志写入优化**: `server/src/db/asyncLogFlusher.ts` 包含一个异步队列刷写器，用于将大量的 Intent 和 Resolve 文本异步写入 SQLite，以避免阻塞主模拟事件循环。