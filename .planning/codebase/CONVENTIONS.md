# CONVENTIONS.md

## Coding Standards & Patterns

### Naming Conventions
- **Files**: kebab-case is preferred for source files (e.g., `cognitiveEngine.ts`, `memoryStream.ts`).
- **Functions & Variables**: camelCase (e.g., `addMemory`, `getMemories`).
- **Types & Classes**: PascalCase (e.g., `Memory`, `LLMProvider`).

### Type Safety
- **TypeScript**: Strict usage across `server`, `web`, and `shared` workspaces.
- **Interfaces**: Extensive use of shared interfaces for LLM outputs, economic mechanics, and simulation state.
- **Barrel Files**: Common use of `index.ts` files for clean exports (e.g., `server/src/db/repos/index.ts`).

### Module Design
- **Functional Services**: Logic is organized into specialized services (e.g., `cognition`, `mechanics`, `orchestration`).
- **Repository Pattern**: Database interactions are abstracted through repositories in `server/src/db/repos/`.
- **ESM Imports**: Uses ESM-style imports (including `.js` extensions in TS files where necessary for compatibility).

### Error Handling
- **Retry with Healing**: A specialized pattern for LLM calls (`server/src/llm/retryWithHealing.ts`) that attempts to "heal" malformed JSON or retry on failure.
- **Structured Responses**: Consistent use of JSON-based communication between the frontend and backend.
