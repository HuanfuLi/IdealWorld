# Technology Stack

**Analysis Date:** 2025-03-24

## Languages

**Primary:**
- TypeScript 5.9 - Used across the entire monorepo (`server/`, `web/`, `shared/`) for type safety and modern JavaScript features.

**Secondary:**
- CSS - Custom CSS with variables and glassmorphism styling in `web/src/index.css`.

## Runtime

**Environment:**
- Node.js (v24 types) - Primary runtime for the simulation server.
- Web Browser - Modern browsers for the React-based frontend.

**Package Manager:**
- npm - Managed via a monorepo structure with workspaces.
- Lockfile: `package-lock.json` is present.

## Frameworks

**Core:**
- Express 4.21 - Web framework for the server API in `server/src/index.ts`.
- React 19.2 - UI library for the frontend in `web/src/main.tsx`.
- Vite 7.3 - Build tool and dev server for the frontend.

**Testing:**
- Vitest/Jest - Identified via `__tests__` directories in `server/src/llm/` and `server/src/mechanics/`.

**Build/Dev:**
- tsx 4.19 - TypeScript execution for development in `server/package.json`.
- Drizzle Kit 0.30 - Migration and schema management for the database.

## Key Dependencies

**Critical:**
- Drizzle ORM 0.41 - TypeScript ORM for SQLite in `server/src/db/index.ts`.
- better-sqlite3 11.0 - High-performance SQLite driver for Node.js.
- Zustand 5.0 - State management for the React frontend in `web/src/stores/`.
- OpenAI SDK 4.80 - Client for OpenAI and compatible LLM providers.
- Anthropic SDK 0.40 - Client for Claude LLM models.

**Infrastructure:**
- uuid 11.0 - ID generation for agents and sessions.
- react-router-dom 7.13 - Routing for the React SPA.
- lucide-react 0.57 - Icon library for the UI.

## Configuration

**Environment:**
- Local configuration file - `~/.idealworld/config.json` stores application settings and API keys.
- Environment variables - Minimal use, primarily for GCP project/location defaults in `server/src/llm/vertex.ts`.

**Build:**
- `tsconfig.json` - Found in root, `server/`, `web/`, and `shared/` for TypeScript configuration.
- `vite.config.ts` - Found in `web/` for frontend build configuration.

## Platform Requirements

**Development:**
- Node.js 20+
- npm 7+ (for workspace support)
- gcloud CLI (optional, for Vertex AI support)

**Production:**
- Desktop/Server environment with filesystem access (for SQLite and config storage).

---

*Stack analysis: 2025-03-24*
