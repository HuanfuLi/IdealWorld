# Ideal World (理想世界)

**Ideal World** 是一个本地优先、基于大语言模型（LLM）驱动的多智能体社会仿真平台。它通过数十个具有独立人格的“平民智能体（Citizen Agents）”在回合制迭代中进行互动，并由全知的“中央智能体（Central Agent）”和确定性的**神经符号引擎 (Neuro-Symbolic Engine)** 进行引导和裁决。

## 核心特性

- **混合微观回合系统 (Hybrid Micro-Turn System)**：将抽象的“年”缩减为以“1次迭代 = 1周”为周期的 Tick。智能体现在使用**多重行动队列 (Multi-Action Queue)**（每回合最多 3 个动作），支持“先工作、再买粮、最后休息”等复杂行为链。
- **神经符号引擎 (Neuro-Symbolic Engine)**：将严格的确定性物理/经济算法与涌现的大模型心理学相结合。高层意图被解析为 `ActionCodes`，而物质产出则由硬编码引擎精确计算。
- **经验代谢系统 (Empirical MET)**：用基于**代谢当量 (MET)** 的系统取代了固定的生存成本。高强度劳动（如 `WORK_HEAVY_MANUAL`）消耗饱食度的速度最高可比 `REST` 快 7 倍。
- **稳态负荷流水线 (Allostatic Load Pipeline)**：引入了身心衰减模型取代单一压力数值。皮质醇在数学上转化为可逆的**应变 (Strain)**，随后钙化为不可逆的**稳态负荷 (Allostatic Load)**（慢性健康损伤）。
- **恒定乘积 AMM**：消灭了脆弱的点对点以物易物，为粮食等必需品引入了**恒定乘积自动做市商 (x * y = k)**，确保了恒定的流动性和算法化定价。
- **存量-流量一致性 UBI**：实现了 **2% 的财富滞留税 (Demurrage Tax)**，并在每个宏观周期作为**全民基本收入 (UBI)** 重新分配，以防止极端的财富停滞。
- **达尔文羞辱回退机制 (Humiliation Fallback)**：未能达到基本生存阈值的智能体不会被立即抹除，而是会被国家“羞辱”——剥夺所有财富并强行喂食“合成浆糊”，从而形成一个持久的底层阶级。
- **平台无关的智能体网关**：原生支持 Anthropic (Claude), OpenAI, Google (Vertex/Gemini) 以及通过 LM Studio/Ollama 运行的本地模型。

## 推演工作流

系统仿真的单回合（Iteration）分为三个阶段：
1. **认知阶段 (Cognitive Phase)**：智能体检索**主观记忆**（3D 检索），进行**定向经济反思**，并根据物质现实更新其**递归计划**。
2. **意图阶段 (Intent Phase/Parallel)**：平民智能体以自然语言声明意图，随后被解析为行动队列。
3. **裁决阶段 (Resolution Phase)**：中央智能体叙述社会产出，而**物理引擎**计算确定性的数值变动、MET 代谢以及 AMM 市场清算。

## 技术注意事项

- **本地优先**：所有数据均存储在本地 SQLite 数据库中 (`~/.idealworld/idealworld.db`)。
- **当前局限性**：
  - 稳态负荷和 AMM 储备目前存储在易失性内存中（重启服务器后会重置）。
  - 智能体的年龄和体重目前为硬编码（数据库 Schema 更新尚在计划中）。

## 快速上手

1. 根目录安装依赖：
   ```bash
   npm install
   ```
2. 启动应用：
   ```bash
   npm run dev
   ```

## 文档

全套相关的架构设计、UI 规范以及详细的机制解释均放置在此 `Documents/` 目录中。

## 开源许可

本项目采用 [GNU Affero General Public License v3.0 (AGPLv3)](../LICENSE) 授权。
