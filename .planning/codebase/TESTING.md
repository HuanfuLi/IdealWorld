# TESTING.md

## Testing Strategy & Frameworks

### Framework
- **Custom Runner**: The project currently uses standalone scripts executed with `tsx` rather than a traditional test runner like Jest or Vitest.
- **Assertions**: Custom `assert(condition, message)` and `section(name)` functions are defined within test files to structure output.

### Organization
- **Co-location**: Tests are stored in `__tests__` directories within their respective modules (e.g., `server/src/llm/__tests__`, `server/src/cognition/__tests__`).
- **Phase-based Testing**: Tests are often organized by "Phases" (e.g., `phase3.test.ts`) to verify integrated functionality of a specific feature set.

### Strategy
- **Integration Focus**: Heavy emphasis on integration tests that verify the flow between components (e.g., Parser Agent -> Cognitive Engine).
- **Mocking**: External LLM providers are manually mocked to ensure deterministic results during testing.
- **Physics Sandbox**: A dedicated `physics_sandbox.ts` exists for verifying deterministic mechanics like metabolism and AMM calculations.
