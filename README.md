# Ideal World

**Ideal World** is a local-first, LLM-powered multi-agent society simulation platform. It models micro-societies by having dozens of distinct LLM-driven "Citizen Agents" interact in high-resolution turn-based iterations, guided by an omniscient "Central Agent" and a deterministic **Neuro-Symbolic Engine**.

## Key Features

- **Hybrid Micro-Turn System**: "1 Iteration = 1 Week" ticks. Agents utilize a **Multi-Action Queue** (up to 3 actions per turn) allowing for complex behaviors like "Work, then Buy Food, then Rest."
- **Neuro-Symbolic Engine**: Combines deterministic physics/economic algorithms with emergent LLM psychology. High-level intent is parsed into `ActionCodes`, while material outcomes are calculated by a hard-coded engine.
- **HMAS Map-Reduce Architecture**: Optimized for high agent counts (20-150+), utilizing a clustering strategy to process agent intents and group resolutions efficiently.
- **Empirical Metabolism (MET)**: Caloric burn system where task intensity (`WORK_HEAVY_MANUAL` vs `REST`) and agent characteristics (weight, age) dictate satiety depletion.
- **Allostatic Load Pipeline**: Psychosomatic decay model where chronic stress (Cortisol) converts into reversible **Strain** and eventually irreversible **Allostatic Load** (chronic health damage).
- **Constant Product AMM**: Always-liquid algorithmic market maker ($x \cdot y = k$) for commodities like Food, Raw Materials, and Luxury Goods.
- **Stock-Flow Consistent UBI**: A **2% Demurrage Tax** on wealth redistributed as **Universal Basic Income (UBI)** every macro-cycle to ensure money velocity.
- **Darwinian Humiliation Fallback**: A survival safety net where destitute agents are "humiliated" (wealth reset, stress spike) rather than immediately removed, maintaining societal pressure.
- **Provider-Agnostic LLM Gateway**: Supports Anthropic (Claude), OpenAI, Google (Vertex/Gemini), and local models (via Ollama).

## Project Architecture

### The Three-Phase Iteration Loop
1. **Cognitive Phase**: Agents retrieve memories, run directional economic reflections, and update recursive plans.
2. **Intent Phase (Parallel)**: Citizen Agents declare intentions, parsed into a structured Multi-Action Queue.
3. **Resolution Phase (Map-Reduce)**: The Central Agent narrates social outcomes, while the **Physics Engine** calculates deterministic deltas (MET, Allostatic Load, AMM clearing).

## Technical Notes

- **Local-First**: All data is stored in a local SQLite database (`~/.idealworld/idealworld.db`).
- **Persistence**: AMM reserves and market states are persisted across sessions.
- **Current Limitations**: 
  - Allostatic load values (Strain/Load) are currently stored in volatile memory (reset on server restart).
  - Agent age and weight are currently using defaults as they are missing from the core database schema.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the application:
   ```bash
   npm run dev
   ```

## Documentation

Full project design, architectural plans, and detailed mechanism explanations can be found in the `Documents/` directory. 

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPLv3). See the [LICENSE](LICENSE) file for details.
