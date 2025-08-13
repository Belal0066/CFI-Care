# MedFlow Front-End Demo

This directory contains a Vite + React + TypeScript demo for visualizing patient medical timelines, vitals, events, and collaborative history/version data.

## Contents

Core entry + config:
- [index.html](index.html)
- [index.tsx](index.tsx)
- [App.tsx](App.tsx)
- [types.ts](types.ts)
- [vite.config.ts](vite.config.ts)
- [tsconfig.json](tsconfig.json)
- [metadata.json](metadata.json)
- [package.json](package.json)
- [.env.local](.env.local) (local-only, not committed)
- [components/](components/)
  - [ConflictResolutionModal.tsx](components/ConflictResolutionModal.tsx)
  - [CurrentStatus.tsx](components/CurrentStatus.tsx)
  - [DependencyGraph.tsx](components/DependencyGraph.tsx)
  - [DetailedHistoryGraph.tsx](components/DetailedHistoryGraph.tsx)
  - [EpisodeSelector.tsx](components/EpisodeSelector.tsx)
  - [EventDetailModal.tsx](components/EventDetailModal.tsx)
  - [HighLevelTimeline.tsx](components/HighLevelTimeline.tsx)
  - [icons.tsx](components/icons.tsx)
  - [StaticPatientInfo.tsx](components/StaticPatientInfo.tsx)
  - [VitalsGraph.tsx](components/VitalsGraph.tsx)
- [services/ehrDataService.ts](services/ehrDataService.ts)
- [utils/](utils/)

## Prerequisites

| Tool | Recommended Version |
|------|---------------------|
| Node.js | 18 LTS or 20 LTS |
| Package manager | npm (bundled) or pnpm / yarn |
| Modern browser | Chrome / Edge / Firefox |

Check:
```
node -v
npm -v
```

## Install

From the repo root:
```
cd Website-Demo
npm install
```
(Use `pnpm install` or `yarn install` if preferred.)

## Environment Configuration

Create / edit [.env.local](.env.local). Example:
```
VITE_API_BASE_URL=https://api.example.test
VITE_WS_URL=wss://api.example.test/ws
VITE_PATIENT_ID=demo-patient-001
VITE_FEATURE_FLAGS=timeline,vitals,dependencyGraph
VITE_MOCK_MODE=true
```

Notes:
- Prefix must be `VITE_` to be exposed to the client.
- `VITE_MOCK_MODE=true` can instruct [services/ehrDataService.ts](services/ehrDataService.ts) to return local or synthesized data (implement logic there).
- Separate real back-end URL vs mock mode to avoid accidental PHI transmission in development.

Never commit secrets; `.env.local` stays untracked (see [.gitignore](.gitignore)).

## Scripts (from [package.json](package.json))

Common (adjust if the file defines differently):
```
npm run dev       # Start Vite dev server
npm run build     # Production build (dist/)
npm run preview   # Preview build output
npm run lint      # (If configured) lint sources
```

Start development:
```
npm run dev
```
Open the printed local URL (default http://localhost:5173).

Preview production build:
```
npm run build
npm run preview
```

## Project Architecture

Flow:
[index.tsx](index.tsx) bootstraps React -> [App.tsx](App.tsx) orchestrates layout and composes feature components.

Key UI Components (all in [components/](components/)):

| Component | Purpose |
|-----------|---------|
| [HighLevelTimeline.tsx](components/HighLevelTimeline.tsx) | Condensed chronological patient events for quick scanning. |
| [DetailedHistoryGraph.tsx](components/DetailedHistoryGraph.tsx) | Granular view with branching / version nodes (Git-like medical history concept). |
| [DependencyGraph.tsx](components/DependencyGraph.tsx) | Visual relationships among events (e.g., lab → diagnosis → treatment). |
| [VitalsGraph.tsx](components/VitalsGraph.tsx) | Time-series vitals (HR, BP, O2, temp). |
| [EpisodeSelector.tsx](components/EpisodeSelector.tsx) | Filters by encounter / episode / admission. |
| [CurrentStatus.tsx](components/CurrentStatus.tsx) | Snapshot of current patient metrics. |
| [StaticPatientInfo.tsx](components/StaticPatientInfo.tsx) | Demographics / immutable baseline data. |
| [EventDetailModal.tsx](components/EventDetailModal.tsx) | Drill-down into a selected event, lab, or note. |
| [ConflictResolutionModal.tsx](components/ConflictResolutionModal.tsx) | Resolves concurrent edits / merges in branched history. |
| [icons.tsx](components/icons.tsx) | Centralized SVG / icon components. |

Data + Integration:
- [services/ehrDataService.ts](services/ehrDataService.ts): Fetch / mock layer (REST or future WebSocket). Inject API base via `import.meta.env.VITE_API_BASE_URL`.
- [types.ts](types.ts): Shared domain models (events, vitals, history nodes). Keep strict typing to prevent UI/runtime mismatches.
- [utils/](utils/): Formatting, date normalization, aggregation helpers.

Configuration:
- [vite.config.ts](vite.config.ts): Dev server, aliases, plugin setup.
- [tsconfig.json](tsconfig.json): Compiler + path mapping.
- [metadata.json](metadata.json): Optional static metadata (e.g. build info, commit hash, feature switches).

## Data & Mocking Strategy

Recommended pattern in [services/ehrDataService.ts](services/ehrDataService.ts):
1. Check `import.meta.env.VITE_MOCK_MODE`.
2. If mock:
   - Return static JSON objects or generate synthetic timeline/vitals.
3. Else:
   - Fetch `${import.meta.env.VITE_API_BASE_URL}/...` endpoints.
4. Normalize responses to internal models from [types.ts](types.ts) before reaching components.

Add caching / memoization where high-frequency updates occur (vitals polling).

## Feature Flags

Environment variable: `VITE_FEATURE_FLAGS=timeline,vitals`
Parse into a Set; conditionally render modules in [App.tsx](App.tsx). Keeps demo minimal for presentations.

## Adding a New Visualization

1. Create `components/NewVisualization.tsx`.
2. Add types (if needed) in [types.ts](types.ts).
3. Expose fetch/transform in [services/ehrDataService.ts](services/ehrDataService.ts).
4. Gate with feature flag `newVisualization`.
5. Import & insert into layout inside [App.tsx](App.tsx).

## Styling / Theming

If using CSS modules / Tailwind / inline styles (pick one consistently). Add global imports in [index.tsx](index.tsx) or a root layout wrapper. Keep medically critical values (e.g., abnormal vitals) styled with accessible contrast.

## Performance Considerations

- Batch state updates inside graph components.
- Debounce timeline zoom / pan events.
- Use `React.memo` for static panels like [StaticPatientInfo.tsx](components/StaticPatientInfo.tsx).
- Virtualize long event lists in `DetailedHistoryGraph` if record count grows.

## Accessibility

- Ensure all interactive nodes in timeline / graphs are keyboard navigable.
- Provide aria labels for icons from [icons.tsx](components/icons.tsx).
- Maintain colorblind-safe palette for vitals and dependency edges.

## Testing (m4 delwa2ty)

Not included here, but advisable:
- Component tests (Vitest + React Testing Library).
- Data service mocks.
- Visual regression (Chromatic / Storybook) for graphs.

## Building for Deployment

```
npm run build
```
Outputs `dist/` (hashed static assets). Serve via static host (Nginx, Netlify, Vercel). Ensure reverse proxy adds appropriate security headers (CSP, X-Frame-Options).

## Troubleshooting

| Symptom | Action |
|---------|--------|
| 404 on asset | Run fresh `npm run build`; clear cache. |
| Env var undefined | Confirm `VITE_` prefix and restart dev server. |
| CORS errors | Configure backend `Access-Control-Allow-Origin` for dev origin. |
| Empty graphs | Verify mock mode data generation or API endpoint availability. |

## Roadmap Alignment

This demo visual layer corresponds to the broader architecture (Express.js backend, PostgreSQL, versioned medical history, security stack) described in the project proposal (see root `main.tex`).

## License / Data Privacy

Do not use real PHI in development. Only synthetic or fully anonymized data. Add a license file before public distribution.

## Quick Start (TL;DR)

```
git clone <repo>
cd Website-Demo
cp .env.local.example .env.local   # create if you add an example
# edit env values
npm install
npm run dev
```

Open http://localhost:5173 and explore timelines, vitals, dependencies, and conflict resolution flows.

---