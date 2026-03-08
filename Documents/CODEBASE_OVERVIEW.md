# Ideal World - Comprehensive Codebase Overview

This document provides a highly detailed architectural and mechanical overview of the **Ideal World** platform. It covers the project's goals, structural design, workflows, algorithm mechanisms (Neuro-Symbolic Engine), and technical optimizations. This document acts as the definitive source of truth for AI agents and human developers to rapidly understand the entire project and contribute immediately.

---

## 1. Project Goal and Architecture
**Ideal World** is a local-first, LLM-powered multi-agent society simulation platform. It models micro-societies of 20 to 150+ "Citizen Agents" interacting in turn-based iterations, guided by an omniscient "Central Agent". 
The core philosophy revolves around a **Neuro-Symbolic Engine**, removing pure LLM math hallucinations and replacing them with deterministic economics and physics calculations (e.g., cortisol, dopamine, hunger).

### Technical Stack
- **Workspaces**: Monorepo using npm workspaces (`web`, `server`, `shared`).
- **Backend**: Node.js (Express), TypeScript, SQLite (Drizzle ORM), multi-provider LLM SDKs (Anthropic, OpenAI, local Ollama).
- **Frontend**: React 19, TypeScript, Zustand (State Management), Tailwind CSS, Vite.
- **Data Storage**: Local SQLite database stored in `~/.idealworld/idealworld.db` featuring asynchronous queued writes.
- **Communication**: Polling-free Server-Sent Events (SSE) for real-time frontend updates.

---

## 2. Platform Workflow
The application runs on a structured 7-stage lifecycle:
**1. Idea Input -> 2. Brainstorming -> 3. Design -> 4. Refine -> 5. Simulate -> 6. Reflect -> 7. Review.**

*Code Evidence (`server/src/db/schema.ts`):*
```typescript
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  title: text('name').notNull(),
  idea: text('seed_idea').notNull(),
  stage: text('stage').notNull().default('idea-input'), // Tracks the 7-stage position
  config: text('config'),
  // ...
});
```

---

## 3. The Multi-Agent Tick Engine

Ideal World uses a **Linear Tick Engine** rather than a synchronous iteration-based loop. This allows for real-time biological decay, multi-period tasks (e.g., building an enterprise taking 24 ticks), and asynchronous LLM response handling.

### Key Engine Mechanisms
1. **The Tick Loop**: Every simulation "tick" (representing a period of time) advances the state of all agents concurrently.
2. **Asynchronous Task Queue**: When an agent completes a task or is idle, they are added to a `promptQueue`. LLM requests are dispatched in batches fire-and-forget, allowing the symbolic engine to keep ticking while waiting for cognitive responses.
3. **TickStateStore**: An in-memory store that tracks high-frequency agent needs (satiety, energy, cortisol) to avoid database bottlenecks.

*Code Evidence (`server/src/orchestration/simulationRunner.ts`):*
```typescript
    // The core tick loop
    for (let tick = 0; tick < totalTicks; tick++) {
      const currentTick = tickStateStore.incrementTick();

      // 1. SYMBOLIC: Apply passive needs decay (Hunger, Fatigue)
      for (const agent of aliveAgents) {
        const decayResult = applyNeedsDecay({ ... });
        tickStateStore.set(agent.id, { ...decayResult.updatedNeeds });

        // 2. Neuro-Symbolic Interrupt: Force LLM re-prompt on critical needs
        if (decayResult.interrupt?.severity === 'critical') {
          promptQueue.set(agent.id, 'needs-interrupt');
        }
      }

      // 3. Advancing Tasks: Complete multi-tick actions
      // 4. NEURO: Prompt idle agents via promptAgentsBatch
      if (promptQueue.size > 0) {
        promptAgentsBatch(agentsToPrompt, ...).then(newTasks => {
           // Assign tasks with startTick and durationTicks
        });
      }
      
      await sleep(500); // Pacing
    }
```

---

## 4. The Neuro-Symbolic Engine

The pinnacle algorithm of Ideal World is the **Neuro-Symbolic Engine**, ensuring agents adhere strictly to fundamental realities like resource limits and mortality.

### 4.1 "Neuro" (Cognitive prompts & NLP generation)
The LLM generates agent intents securely based on physical and psychological contexts. The prompt dynamically shifts tone when an agent is starving or under extreme stress (cortisol). It uses **Citizen-specific models** (e.g., Haiku) for mass agents and **Central models** for global governance.

*Code Evidence (`server/src/llm/gateway.ts`):*
```typescript
/** Returns a separate provider for citizen agent tasks if configured. */
export function getCitizenProvider(): LLMProvider {
  const settings = readSettings();
  // Ensures we use settings.citizenAgentModel even on the main provider
  return createProviderFromSettings(settings, true);
}
```

### 4.2 "Bridge" (Action Codes & Interrupts)
The Bridge translates symbolic distress (e.g., HP < 10) into cognitive directives ("You are starving!") and parses LLM intents back into deterministic **Action Codes** with durations.

*Code Evidence (`server/src/mechanics/actionCodes.ts`):*
```typescript
export const ACTION_TICK_DURATIONS: Record<ActionCode, number> = {
  WORK: 1, 
  EAT: 2,
  REST: 4,
  FOUND_ENTERPRISE: 24, // Requires significant time investment
  // ...
};
```

### 4.3 "Symbolic" (Needs Metabolism & Economy)
The Symbolic layer (Physics Engine) manages the deterministic decay of needs and the resolution of completed tasks, including enterprise production and market trades.

*Code Evidence (`server/src/mechanics/physicsEngine.ts`):*
```typescript
export function applyNeedsDecay(input: DecayInput): DecayOutput {
  // Passively reduces satiety and energy every tick
  // Triggers starvation interrupts if satiety hits 0
}
```

---

## 5. Technical Performance Innovations

### 5.1 Backend: Asynchronous SQLite Queuing
To fix database `SQLITE_BUSY` transaction deadlocks (caused by 10,000+ tiny row inserts per iteration on high agent counts), the simulation runner deposits log data into an `asyncLogFlusher` queue rather than blocking the main execution loop. 

*Code Evidence (`server/src/orchestration/simulationRunner.ts`):*
```typescript
      // Enqueue intent rows for async batch flush (non-blocking)
      const intentCols = ['id', 'session_id', 'agent_id', 'iteration_id', 'intent', 'reasoning', 'action_code', 'action_target', 'created_at'];
      for (const intent of intents) {
        asyncLogFlusher.enqueue('agent_intents', intentCols, [
          uuidv4(), sessionId, intent.agentId, iterationId,
          intent.intent, intent.reasoning ?? '',
          intent.actionCode ?? 'NONE', intent.actionTarget ?? null,
          now,
        ]);
      }
```

### 5.2 Frontend: React SSE Debouncing & Virtual Buffers
Directly tying `setState()` to a Server-Sent Events stream destroys React performance via continuous re-rendering triggers. To achieve 60 FPS, Zustand intercepts the `EventSource` stream, mutating a background array queue, and dumping it to React only via `requestAnimationFrame`.

*Code Evidence (`web/src/stores/simulationStore.ts`):*
```typescript
    // ── Double-buffering: push events into a mutable buffer and flush
    // via requestAnimationFrame to avoid per-event React re-renders. ────
    const buffer: SSEEvent[] = [];
    let rafId: number | null = null;

    const flushBuffer = () => {
      rafId = null;
      if (buffer.length === 0) return;

      const batch = buffer.splice(0);
      set(state => {
        // Safe batch ingestion logic here
        // ...
      });
    };

    const scheduleFlush = () => {
      if (rafId === null) rafId = requestAnimationFrame(flushBuffer);
    };

    es.onmessage = (e) => {
        const event = JSON.parse(e.data) as SSEEvent;
        buffer.push(event);
        scheduleFlush(); // Debounced render
    };
```

## Conclusion
 Ideal World heavily interleaves traditional high-performance concurrent scheduling, deterministic physics-like number crunching, and Generative Artificial Intelligence semantic intelligence. Developers should strictly preserve this **Neuro-Symbolic** barrier: AI defines **What/Why**, and the Hardcoded Physics dictates **How Much**.
