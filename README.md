# Ideal World

**Ideal World** is a local-first, LLM-powered multi-agent society simulation platform. It models micro-societies by having dozens to hundreds of distinct LLM-driven "Citizen Agents" interact in turn-based iterations, guided and adjudicated by an omniscient "Central Agent".

## Features

- **Multi-Agent Simulation**: Form a complex virtual society featuring up to 150+ autonomous citizen agents.
- **Neuro-Symbolic Engine**: Combines strict deterministic physics/economic engines with emergent LLM psychology.
- **HMAS Map-Reduce Architecture**: Uses clustering algorithms and intermediate "Coordinator Agents" to massively reduce LLM context windows, API limits, and token costs by over 90%.
- **High-Performance Infrastructure**: 
  - **Backend**: Node.js, Express, and a highly optimized SQLite DB using WAL mode and asynchronous memory queues for heavy I/O iteration logging.
  - **Frontend**: React 19 + Zustand with `requestAnimationFrame` (rAF) debouncing, Server-Sent Events (SSE), and virtualized lists capable of rendering thousands of agent updates in real-time without stuttering.
- **Provider-Agnostic LLM Gateway**: Easily configure Anthropic (Claude), OpenAI, or local, offline models (via LM Studio/Ollama) to act as central or citizen agents. 

## Project Architecture

### The Two-Phase Iteration Loop
1. **Intent Phase (Parallel)**: All living Citizen Agents process their surroundings and neurobiological states (e.g., *cortisol*, *dopamine*) to declare their *intentions*, processed locally or via batched fast models.
2. **Resolution Phase (Serial/Map-Reduce)**: Regional Coordinator Agents compress intents, and the Central Agent calculates outcomes combining hard laws with LLM-based logic. The deterministic Physics Engine calculates material outcomes, creating the final iteration truth.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the application (starts both Vite frontend and backend via Concurrently):
   ```bash
   npm run dev
   ```

## Documentation

Full project design, architectural plans, UI specifications, and detailed mechanism enhancements can be found in the `Documents/` directory. 

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
