# Ideal World

**Ideal World** is a local-first, LLM-powered multi-agent society simulation platform. It models micro-societies by having dozens of distinct LLM-driven "Citizen Agents" interact in turn-based iterations, guided by an omniscient "Central Agent" and a deterministic **Neuro-Symbolic Engine**.

## Key Features

- **Hybrid Micro-Turn System**: Replaced abstract "years" with "1 Iteration = 1 Week" ticks. Agents now utilize a **Multi-Action Queue** (up to 3 actions per turn) allowing for complex behaviors like "Work, then Buy Food, then Rest."
- **Neuro-Symbolic Engine**: Combines strict deterministic physics/economic algorithms with emergent LLM psychology. High-level intent is parsed into `ActionCodes`, while material outcomes are calculated by a hard-coded engine.
- **Empirical Metabolism (MET)**: Replaced flat survival costs with a **Metabolic Equivalent of Task** system. High-intensity labor (e.g., `WORK_HEAVY_MANUAL`) depletes satiety up to 7x faster than `REST`.
- **Allostatic Load Pipeline**: Replaced simple stress stats with a psychosomatic decay model. Cortisol mathematically converts into reversible **Strain**, which calcifies into irreversible **Allostatic Load** (chronic health damage).
- **Constant Product AMM**: Eradicated fragile peer-to-peer bartering in favor of a **Constant Product Automated Market Maker ($x \cdot y = k$)** for essential commodities like Food, ensuring constant liquidity and algorithmic pricing.
- **Stock-Flow Consistent UBI**: Implemented a **2% Demurrage Tax** on wealth that is redistributed as **Universal Basic Income (UBI)** every macro-cycle to prevent extreme wealth stagnation.
- **Darwinian Humiliation Fallback**: Agents failing to meet basic survival thresholds are "humiliated" by the state—stripped of wealth and force-fed "synthetic slop"—rather than immediately killed, creating a persistent underclass.
- **Provider-Agnostic LLM Gateway**: Supports Anthropic (Claude), OpenAI, Google (Vertex/Gemini), and local models (via LM Studio/Ollama).

## Project Architecture

### The Three-Stage Iteration Loop
1. **Cognitive Phase (Pre-Processing)**: Agents retrieve **Subjective Memories** (3D retrieval), run **Directional Economic Reflections**, and update their **Recursive Plans** based on material reality.
2. **Intent Phase (Parallel)**: Citizen Agents declare their intentions in natural language, which is parsed into an Action Queue.
3. **Resolution Phase (Serial/Map-Reduce)**: The Central Agent narrates the social outcomes, while the **Physics Engine** calculates deterministic stat deltas, MET metabolism, and AMM market clearing.

## Technical Notes

- **Local-First**: All data is stored in a local SQLite database (`~/.idealworld/idealworld.db`).
- **Current Limitations**: 
  - Allostatic load and AMM reserves are currently stored in volatile memory (reset on server restart).
  - Agent age and weight are currently hardcoded (database schema updates pending).

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
