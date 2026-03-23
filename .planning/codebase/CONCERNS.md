# CONCERNS.md

## Identified Technical Debt & Risks

### Technical Debt
- **Monolithic Simulation Runner**: `server/src/orchestration/simulationRunner.ts` (~2,940 lines) manages too many responsibilities, including the main loop, physics, and persistence.
- **Large Prompt Registry**: `server/src/llm/prompts.ts` (>1,600 lines) centralizes all complex templates, making it difficult to maintain and version.
- **Type Safety Gaps**: Occasional use of `any` in LLM providers (`vertex.ts`, `openai.ts`) and configuration routes, which bypasses TypeScript's safety benefits.

### Known Issues & Anti-Patterns
- **Console Logging**: Frequent use of `console.log` for core simulation logic and "Sheriff" flagging instead of a structured logging library.
- **Performance Risks**: Complex prompts are rebuilt using string concatenation in every iteration, which may cause performance issues as agent counts scale.
- **Async Complexity**: High frequency of async operations in the simulation loop requires careful management to avoid race conditions.

### Coverage Gaps
- **Main Loop Integration**: Lack of end-to-end integration tests that cover the entire path from agent intention to final database persistence and SSE emission.
- **UI State Synchronization**: Complex state management between Zustand and SSE updates may lead to desynchronization in high-load scenarios.

### Recommendations
1. **Modularize Simulation Logic**: Refactor `simulationRunner.ts` into smaller, focused services.
2. **Decompose Prompts**: Split `prompts.ts` into domain-specific files (e.g., `agentPrompts.ts`, `centralAgentPrompts.ts`).
3. **Structured Logging**: Transition to a professional logging library (e.g., `pino`).
4. **Strict Typing**: Replace `any` types with Zod schemas or strict interfaces for LLM interaction.
