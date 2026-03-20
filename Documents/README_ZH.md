# Ideal World (理想世界)

**Ideal World** 是一个本地优先、LLM 驱动的多代理社会模拟平台。它通过数十个各具特色的 LLM 驱动的“公民代理”在细粒度的回合制迭代中进行交互，由全知的“中央代理”和确定性的 **神经符号引擎 (Neuro-Symbolic Engine)** 引导。

## 核心特性

- **混合微回合系统 (Hybrid Micro-Turn System)**：“1 次迭代 = 1 周”。代理现在利用 **多操作队列 (Multi-Action Queue)**（每回合最多 3 个操作），允许复杂的行为逻辑，如“先工作，然后买食物，最后休息”。
- **神经符号引擎 (Neuro-Symbolic Engine)**：将严格的确定性物理/经济算法与涌现的 LLM 心理学相结合。高层意图被解析为 `ActionCodes`，而物质结果由硬编码引擎计算。
- **HMAS Map-Reduce 架构**：针对高代理数量 (20-150+) 进行了优化，利用集群策略高效处理代理意图和分组决议。
- **经验代谢系统 (MET)**：根据任务强度（如 `WORK_HEAVY_MANUAL` 与 `REST`）以及代理特征（体重、年龄）决定饱腹度消耗。
- **异体负荷管线 (Allostatic Load Pipeline)**：心身衰减模型，其中慢性压力 (皮质醇) 转化为可逆的 **应变 (Strain)**，并最终钙化为不可逆的 **异体负荷 (Allostatic Load)**（慢性健康损伤）。
- **恒定乘积 AMM**：为食物、原材料和奢侈品等商品提供始终流动的算法市场制造者 ($x \cdot y = k$)。
- **存量-流量一致性 UBI**：对财富征收 **2% 的滞留税 (Demurrage Tax)**，并作为 **全民基本收入 (UBI)** 每 10 次迭代重新分配，以确保货币流动性。
- **达尔文式羞辱回退 (Darwinian Humiliation Fallback)**：生存安全网，赤贫代理会被系统“羞辱”（财富清零、压力激增）而不是直接移除，从而维持社会压力。
- **厂商无关的 LLM 网关**：支持 Anthropic (Claude), OpenAI, Google (Vertex/Gemini) 以及本地模型 (通过 Ollama)。

## 项目架构

### 三阶段迭代循环
1. **认知阶段 (Cognitive Phase)**：代理检索主观记忆，进行定向经济反思，并根据物质现实更新递归计划。
2. **意图阶段 (Intent Phase - 并行)**：公民代理以自然语言声明意图，解析为结构化的多操作队列。
3. **决议阶段 (Resolution Phase - Map-Reduce)**：中央代理叙述社会结果，同时 **物理引擎** 计算确定性的属性增量（MET 代谢、异体负荷、AMM 市场清算）。

## 技术说明

- **本地优先**：所有数据存储在本地 SQLite 数据库中 (`~/.idealworld/idealworld.db`)。
- **持久化**：AMM 储备和市场状态现在跨会话持久化。
- **当前局限**：
  - 异体负荷值（应变/负荷）目前存储在易失性内存中（服务器重启时重置）。
  - 代理年龄和体重目前使用默认值，因为数据库架构尚未更新这些字段。

## 快速开始

1. 安装依赖：
   ```bash
   npm install
   ```
2. 启动应用：
   ```bash
   npm run dev
   ```

## 文档

完整的项目设计、架构计划和详细的机制解释可以在 `Documents/` 目录中找到。

## 许可证

本项目采用 GNU Affero General Public License v3.0 (AGPLv3) 许可证。详情请参阅 [LICENSE](LICENSE) 文件。
