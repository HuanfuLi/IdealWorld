# IdealWorld Project Memory

## Stack
- React 19 + TypeScript + Vite + react-router-dom v7 + lucide-react
- No Tailwind — custom CSS in `src/index.css` and `src/App.css`
- CSS variable theming: dark (default) and light mode via `[data-theme="light"]`

## Architecture
- `src/App.tsx`: Router + persistent sidebar layout (`MainLayout`)
- `src/index.css`: Global vars, utility classes, glassmorphism helpers
- `src/App.css`: Layout: .app-container, .sidebar, .main-content, .nav-item etc.
- `src/pages/`: 9 page components for session flow

## Session Flow (routes)
`/` → HomePage → `/session/:id/idea` → `/session/:id/brainstorm` → `/session/:id/design` → `/session/:id/simulation` → `/session/:id/reflection` → `/session/:id/agents` → `/session/:id/artifacts`

## UI Review Fixes Applied (pre-Phase 1)
- Added `.text-muted` and `.text-primary` CSS utility classes
- Fixed `.glass-card`, `.btn-secondary`, `.input-glass`, scrollbar to use CSS vars (light-mode compatible)
- Removed unused imports (`ChevronLeft`, `ChevronRight`, `Menu`) from App.tsx
- All session pages now use `useParams()` for `:id` in navigation instead of hardcoded `/session/new/`
- Replaced `window.location.href` with `useNavigate()` in AgentReview
- Added auto-scroll (useRef + useEffect) to Brainstorming and AgentReview chat panels
- Updated model names in Settings: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- Removed hardcoded API key defaultValue from Settings

## Phase 1 (not yet implemented)
- Real backend/LLM integration to replace stub static data
