# Ideal World — User Flow

This document describes the complete end-to-end user flow for Ideal World, a multi-agent society simulation platform. Each agent simulates a person in a virtual society, and the collective behavior of all agents (up to hundreds) mimics the dynamics of a small society. Users design the rules of a society, watch it evolve over multiple iterations, and then review the outcome through agent reflections and cross-session comparisons.

---

## Table of Contents

1. [Flow Overview](#1-flow-overview)
2. [Session Management](#2-session-management)
3. [Stage 0 — Idea Input](#3-stage-0--idea-input)
4. [Stage 1 — Society Brainstorming & Design](#4-stage-1--society-brainstorming--design)
5. [Stage 2 — Simulation](#5-stage-2--simulation)
6. [Stage 3 — Reflection & Summary](#6-stage-3--reflection--summary)
7. [Stage 4 — Agent Review & Q&A](#7-stage-4--agent-review--qa)
8. [Artifacts Page](#8-artifacts-page)
9. [Cross-Session Comparison](#9-cross-session-comparison)
10. [Data Persistence & Session Lifecycle](#10-data-persistence--session-lifecycle)

---

## 1. Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        APPLICATION ENTRY                                │
│  User lands on Home Page → sees past sessions + "New Session" button    │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                      ┌────────────▼────────────┐
                      │  STAGE 0: Idea Input     │
                      │  User types society idea  │
                      └────────────┬─────────────┘
                                   │
                      ┌────────────▼─────────────┐
                      │  STAGE 1: Brainstorm &    │
                      │  Design (interactive chat) │
                      │  → Ends with "Start Design"│
                      │  → Central Agent designs   │
                      │    agents, roles, law doc   │
                      │  → User enters iteration # │
                      └────────────┬─────────────┘
                                   │
                      ┌────────────▼─────────────┐
                      │  STAGE 2: Simulation       │
                      │  N iterations of agent     │
                      │  actions + state summaries  │
                      └────────────┬─────────────┘
                                   │
                      ┌────────────▼─────────────┐
                      │  STAGE 3: Reflection       │
                      │  Each agent reflects →     │
                      │  Central Agent summarizes   │
                      │  pros/cons of the society   │
                      └────────────┬─────────────┘
                                   │
                      ┌────────────▼─────────────┐
                      │  STAGE 4: Agent Review     │
                      │  User asks questions to     │
                      │  any agent (inc. central)   │
                      │  → Quit when done           │
                      └────────────┬─────────────┘
                                   │
                      ┌────────────▼─────────────┐
                      │  SESSION SAVED             │
                      │  Return to Home Page       │
                      │  (can revisit anytime)      │
                      └─────────────────────────────┘
```

---

## 2. Session Management

### 2.1 Home Page

When the user opens the application, they see the **Home Page** containing:

| Element | Description |
|---|---|
| **Session List** | A list of all previously saved sessions, each showing: session name, society concept (short summary), date created, current stage (completed or in-progress), number of agents, number of iterations. |
| **New Session Button** | Starts a fresh session beginning at Stage 0. |
| **Resume Button** (per session) | Returns the user to wherever they left off in that session. If the session is fully completed (past Stage 3), the user enters Stage 4 (Agent Review) directly. |
| **Compare Sessions Button** | Enabled when 2+ completed sessions exist. Initiates the cross-session comparison flow (see Section 9). |
| **Delete Session Button** (per session) | Removes a session from local storage after confirmation. |

### 2.2 Session State

Every session has a persisted state object that tracks:

- Unique session ID
- Session name (auto-generated or user-provided)
- Current stage (`0`, `1-brainstorm`, `1-design`, `2`, `3`, `4-review`, `completed`)
- All generated documents (see Artifacts Page, Section 8)
- All agent definitions and their data
- Conversation history for each stage
- Timestamps for creation, last modified, and completion

---

## 3. Stage 0 — Idea Input

**Purpose:** The user provides the seed idea for the society they want to simulate.

### User Experience

1. The user sees a clean page with a prominent **text box** and a heading: *"Describe the society you want to simulate."*
2. Below the text box, example prompts are displayed as clickable suggestions:
   - *"A society where everyone shares all the resources of the state, like communism"*
   - *"A libertarian society with no government and pure free-market economics"*
   - *"A technocracy where AI systems make all policy decisions"*
   - *"A medieval feudal society with lords, knights, and peasants"*
3. The user types (or selects) their idea and clicks **"Begin Brainstorming"**.
4. The system creates a new session, records the seed idea, and transitions to Stage 1.

### Validation

- The text box requires a minimum of 10 characters.
- If empty or too short, the button is disabled with a tooltip: *"Please describe your society idea in more detail."*

---

## 4. Stage 1 — Society Brainstorming & Design

Stage 1 has two distinct phases: **Brainstorming** (interactive conversation) and **Design** (automated generation).

### 4.1 Phase A — Brainstorming (Interactive Conversation)

**Purpose:** The Central Agent and the user collaboratively refine the society concept until enough detail exists to design the simulation.

#### User Experience

1. The interface transitions to a **chat view**. The Central Agent sends the first message, acknowledging the user's idea and asking clarifying questions. For example:

   > *"Interesting — you want to simulate a communist society where all resources are shared. Let me ask a few questions to flesh this out:*
   > *1. Is there a central governing body that allocates resources, or is it a decentralized commune model?*
   > *2. What era or technology level should this society have?*
   > *3. Are there any external pressures (neighboring societies, natural disasters, scarcity)?*
   > *4. How large do you imagine this community — a village, a city, a nation?"*

2. The user responds freely in the chat. The Central Agent continues asking follow-up questions, offering suggestions, and helping the user think through edge cases. Topics the Central Agent covers include:

   - **Governance model:** Who makes decisions? How are disputes resolved?
   - **Economic system:** How are resources produced, distributed, and consumed?
   - **Social structure:** Are there classes, castes, or roles? Is there social mobility?
   - **Legal framework:** What rules govern behavior? What are the penalties for violations?
   - **Cultural norms:** What values does the society hold? What is taboo?
   - **External environment:** Is the society isolated or connected? Are resources abundant or scarce?
   - **Conflict mechanisms:** How do disagreements escalate? Is there a military or police?
   - **Technology & education:** What is the knowledge level? How is information shared?

3. The Central Agent internally tracks a "completeness checklist" of topics. When it determines that sufficient detail has been gathered, it sends a summary message:

   > *"I think we have a solid foundation. Here's what I've gathered: [summary of all discussed points]. If this looks good, click **Start Design** to proceed. Otherwise, keep chatting to refine."*

4. A **"Start Design"** button appears in the chat interface. The user can either:
   - Click **Start Design** to proceed to Phase B.
   - Continue chatting to add more detail (the button remains available).

#### Central Agent Behavior

- The Central Agent is patient, thorough, and Socratic — it asks probing questions rather than making assumptions.
- It never rushes the user. The "Start Design" prompt is a suggestion, not a demand.
- If the user tries to click "Start Design" before the Central Agent has suggested it, a warning appears: *"The Central Agent hasn't finished gathering details yet. Are you sure you want to proceed with the current information?"* The user can override this.

### 4.2 Phase B — Design (Automated Generation)

**Purpose:** The Central Agent uses all brainstormed details to design the full society, including all agents, their backgrounds, and the virtual law document.

#### User Experience

1. After the user clicks **Start Design**, the chat shows a progress indicator: *"Designing your society..."*
2. The Central Agent generates the following artifacts (displayed progressively as they are created):

   **a. Agent Roster**
   - Total number of agents (determined by the Central Agent based on the society's needs, typically 20–150).
   - Each agent has:
     - **Name:** A contextually appropriate name.
     - **Role:** Their function in the society (e.g., farmer, bureaucrat, teacher, merchant, soldier).
     - **Background (System Prompt):** A detailed paragraph describing the agent's personality, life history, knowledge level, skills, motivations, fears, and behavioral tendencies. This serves as the system prompt for that agent's LLM calls.
     - **Initial Wealth:** A numeric value (0–100 scale) representing starting economic resources.
     - **Initial Health:** A numeric value (0–100 scale) representing physical well-being.
     - **Initial Happiness:** A numeric value (0–100 scale) representing psychological well-being.

   **b. Virtual Law Document**
   - A comprehensive document that serves as the "constitution" or "law of the land" for the simulated society.
   - Covers: governance rules, economic rules, social norms, penalties for violations, rights and obligations of each role, resource distribution mechanisms, and any special mechanics.
   - Written in clear, structured prose. This document is shared with every agent during simulation.

   **c. Society Overview Document**
   - A summary document describing the society at a high level: its philosophy, structure, key dynamics, and what the simulation aims to explore.

3. Once generation completes, all documents are displayed for the user to review. The user sees:
   - The Society Overview at the top.
   - The full Agent Roster in a browsable table/list.
   - The Virtual Law Document in a scrollable panel.
4. Below the generated content, a **number input** appears: *"How many iterations should the simulation run?"* with a default value of 10 and a range of 1–100.
5. The user enters the desired iteration count and clicks **"Start Simulation"**.

#### Validation

- The user must review (scroll through) the generated content before the "Start Simulation" button becomes active, or at minimum acknowledge the design by clicking a confirmation checkbox: *"I have reviewed the society design."*
- The iteration count must be between 1 and 100.

---

## 5. Stage 2 — Simulation

**Purpose:** The society runs for N iterations. In each iteration, every agent reads their personal state and the shared context, then acts. The Central Agent summarizes each iteration.

### 5.1 Iteration Loop

For each iteration `i` (from 1 to N):

#### Step A — Agent Action Phase

Each agent independently receives the following context and produces a response:

**Agent Input (Iteration 1):**
| Input | Description |
|---|---|
| Background (System Prompt) | The agent's personal background, personality, and behavioral instructions. |
| Current Wealth | Their numeric wealth value. |
| Current Health | Their numeric health value. |
| Current Happiness | Their numeric happiness value. |
| Virtual Law Document | The full law of the society. |
| Instruction | *"Based on your background and the current state of the society, describe what actions you take in this period to improve your life. Consider your relationships with others, your economic activities, your engagement with governance, and any other relevant behaviors. Also state how your actions affect your wealth, health, and happiness (provide updated numbers)."* |

**Agent Input (Iteration 2+):**
All of the above, plus:
| Input | Description |
|---|---|
| Previous Iteration State Summary | The Central Agent's summary of what happened in the previous iteration. |

**Agent Output:**
Each agent produces a structured response containing:
- **Actions taken:** A narrative description of what they did during this iteration.
- **Interactions:** Who they interacted with and how.
- **Updated Wealth:** New wealth value (with justification for change).
- **Updated Health:** New health value (with justification for change).
- **Updated Happiness:** New happiness value (with justification for change).
- **Internal thoughts:** What the agent is thinking or feeling (private, not shared with other agents but visible to user and Central Agent).

#### Step B — Central Agent Summary Phase

After all agents have responded, the Central Agent receives all agent outputs and produces:

- **Iteration State Summary:** A detailed narrative of what happened during this iteration, including:
  - Major events and trends.
  - Notable individual actions and their ripple effects.
  - Economic changes (aggregate wealth movement).
  - Social dynamics (alliances, conflicts, cooperation).
  - Law adherence and violations.
  - Health and happiness trends across the population.
  - Any emergent behaviors or unexpected outcomes.
- **Statistics snapshot:** Aggregate numbers — average wealth, health, happiness; min/max values; distribution changes.

This summary becomes the "state record" for iteration `i` and is persisted.

### 5.2 User Experience During Simulation

1. The UI shows a **simulation dashboard** with:
   - A **progress bar** showing current iteration out of total.
   - A **live feed** that streams the Central Agent's iteration summaries as they complete.
   - A **statistics panel** showing graphs of aggregate wealth, health, and happiness over completed iterations.
   - An **agent grid** showing all agents with color-coded indicators for their current wealth/health/happiness.
2. The user can click on any agent in the grid to see their individual action log for completed iterations.
3. The user **cannot intervene** during the simulation — it runs to completion. However, they can pause the simulation and choose to abort (with confirmation), which saves progress up to the last completed iteration.
4. If the user leaves mid-simulation (closes browser/tab), the session is saved at the last completed iteration. When they return, they can resume from where they left off.

### 5.3 Simulation Completion

When all N iterations are complete:

1. The Central Agent generates a **Final State Report**:
   - A comprehensive summary of the entire simulation trajectory.
   - How the society evolved from its initial state to its final state.
   - Key turning points and inflection moments.
   - Overall trends in wealth, health, and happiness.
   - Which roles/groups thrived and which struggled.
   - Emergent social phenomena (e.g., black markets, revolutions, cooperation patterns).
   - Whether the society's founding principles held up under pressure.
2. The Final State Report is displayed to the user.
3. The system transitions to Stage 3.

---

## 6. Stage 3 — Reflection & Summary

**Purpose:** Each agent reflects on the entire simulation, and the Central Agent synthesizes all reflections into a society-wide evaluation.

### 6.1 Individual Agent Reflections

Each agent receives:

| Input | Description |
|---|---|
| Background (System Prompt) | Their personal background. |
| Final Wealth, Health, Happiness | Their ending stats. |
| Final State Report | The Central Agent's full trajectory summary. |
| Their own action log | Everything they did across all iterations. |
| Instruction | *"The simulation is complete. Reflect on your experience: How did you fare in this society? Why did you behave the way you did? What worked for you and what didn't? What do you think of this form of society — its strengths, its flaws, and whether it is fair? Be honest and speak from your perspective."* |

Each agent produces a **Reflection Document** containing:
- Personal outcome assessment (did they thrive or struggle, and why).
- Behavioral justification (why they made the choices they made).
- Critique of the society's structure (what was fair/unfair, what worked/failed).
- Suggestions for improvement (what changes would make the society better).
- Emotional response (how they "felt" about living in this society).

### 6.2 Central Agent — Society Evaluation

After all agent reflections are collected, the Central Agent produces the **Society Evaluation Report**:

- **Overall verdict:** A balanced assessment of the simulated society.
- **Pros from agents' perspectives:** What agents liked, grouped by themes. Includes which roles/demographics saw benefits and why.
- **Cons from agents' perspectives:** What agents criticized, grouped by themes. Includes which roles/demographics suffered and why.
- **Consensus points:** Where most agents agreed.
- **Points of contention:** Where agents disagreed strongly (often along role/class lines).
- **Emergent insights:** Unexpected lessons from the simulation.
- **Comparison to real-world analogues:** If applicable, how the simulated outcomes compare to historical examples.

### 6.3 User Experience

1. The user sees a summary page with:
   - The Society Evaluation Report prominently displayed.
   - A list of all agents with links to their individual reflections.
   - Key statistics and visualizations (final distribution of wealth/health/happiness, trajectory charts).
2. After reading, the user can proceed to Stage 4 by clicking **"Review Agents"** or go directly to the Artifacts Page.

---

## 7. Stage 4 — Agent Review & Q&A

**Purpose:** The user can interactively ask questions to any agent (including the Central Agent) to probe deeper into the simulation results.

### 7.1 User Experience

1. The interface shows an **agent selection panel** listing all agents (with the Central Agent at the top).
2. The user selects an agent to chat with. A chat window opens.
3. The selected agent responds in character, using:
   - Their original background/personality.
   - Their memory of all actions they took during the simulation.
   - Their reflection document.
   - The Final State Report and Society Evaluation (for context).
4. Example questions a user might ask:
   - To a farmer: *"Why did you start trading illegally in iteration 5?"*
   - To a bureaucrat: *"Do you think the resource distribution was fair?"*
   - To the Central Agent: *"Which agent had the most influence on the society's direction?"*
5. The user can switch between agents freely. Conversation history with each agent is preserved.
6. When the user is done, they click **"End Session"**. The session state is updated to `completed` and saved.

### 7.2 Re-entry

- A completed session can be re-entered at any time from the Home Page.
- Upon re-entry, the user goes directly to the Stage 4 review interface with all data intact.
- All prior Q&A conversations are preserved and visible.

---

## 8. Artifacts Page

**Purpose:** A centralized document repository for each session, organizing all generated content.

### 8.1 Document List

Each session's Artifacts Page contains the following documents, organized chronologically:

| # | Document | Generated At | Description |
|---|---|---|---|
| 1 | **Brainstorming Transcript** | Stage 1A | Full conversation between user and Central Agent during brainstorming. |
| 2 | **Society Overview** | Stage 1B | High-level description of the designed society. |
| 3 | **Agent Roster** | Stage 1B | Complete list of all agents with their names, roles, backgrounds, and initial stats. |
| 4 | **Virtual Law Document** | Stage 1B | The constitution/rulebook shared with all agents. |
| 5 | **Iteration State Summaries** (×N) | Stage 2 | One summary per iteration, each with narrative and statistics. |
| 6 | **Final State Report** | Stage 2 (end) | Comprehensive trajectory and outcome summary. |
| 7 | **Agent Reflections** (×number of agents) | Stage 3 | Each agent's personal reflection on the simulation. |
| 8 | **Society Evaluation Report** | Stage 3 | Central Agent's synthesis of all reflections with pros/cons. |
| 9 | **Q&A Transcripts** (×agents questioned) | Stage 4 | Conversation logs from the review phase. |
| 10 | **Cross-Session Comparison** (if applicable) | Post-session | Comparison analysis across multiple sessions. |

### 8.2 User Experience

- Accessible via a tab/sidebar at any point after Stage 1B.
- Documents can be expanded/collapsed.
- Each document has a **copy** button and an **export** button (Markdown or PDF).
- A search bar allows full-text search across all documents in the session.

---

## 9. Cross-Session Comparison

**Purpose:** After completing multiple sessions with different society models, the user can ask the Central Agent to compare them.

### 9.1 User Experience

1. From the Home Page, the user clicks **"Compare Sessions"**.
2. The user selects 2 or more completed sessions from a checklist.
3. The Central Agent reads the **Final State Reports** and **Society Evaluation Reports** from each selected session.
4. The Central Agent generates a **Cross-Session Comparison Report** containing:
   - Side-by-side summary of each society's design and outcomes.
   - Which society produced the highest average wealth, health, and happiness.
   - Which society had the most equitable distribution of outcomes.
   - Common patterns across societies (e.g., certain roles always struggle).
   - Trade-offs between different societal models (e.g., equality vs. productivity).
   - The Central Agent's synthesized analysis of what design elements correlated with positive or negative outcomes.
5. The report is displayed and saved. The user can ask follow-up questions to the Central Agent in a chat interface.
6. The comparison report is also accessible from the Artifacts Page of each involved session.

### 9.2 Limitations

- Cross-session comparison requires at least 2 completed sessions.
- Sessions being compared should ideally have similar iteration counts for meaningful comparison, though this is not enforced.

---

## 10. Data Persistence & Session Lifecycle

### 10.1 Storage

- All session data is stored in **browser local storage** (for the web application) or **local filesystem** (for desktop/CLI versions).
- Each session is stored as a self-contained JSON object keyed by session ID.
- Storage includes all documents, agent states, conversation histories, and metadata.

### 10.2 Session Lifecycle

```
Created → Brainstorming → Designing → Simulating → Reflecting → Reviewing → Completed
   │           │               │            │            │            │           │
   │           └───── Can resume from any of these stages ────────────┘           │
   │                                                                              │
   └─────────── Can be deleted at any time ──────────────────────────────────────┘
                                                                                  │
                                                           Can re-enter for Q&A ──┘
```

### 10.3 Auto-Save

- The session is auto-saved after every significant state change:
  - After each brainstorming message exchange.
  - After the design phase completes.
  - After each simulation iteration completes.
  - After reflections are generated.
  - After each Q&A message exchange.
- If the user closes the browser mid-operation, they can resume from the last saved checkpoint.

### 10.4 Storage Limits

- Local storage has a typical limit of 5–10 MB per origin. For sessions with many agents and iterations, data may need to be compressed or offloaded to IndexedDB.
- A warning is shown if storage usage exceeds 80% of the estimated limit.
- The user can export sessions to file (JSON) and delete them locally to free space, then re-import later.
