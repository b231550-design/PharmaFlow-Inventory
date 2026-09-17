# Frontend guide

The frontend lives in `artifacts/pharmaflow`. Wouter owns route transitions and TanStack Query owns server state. Generated hooks are imported from `@workspace/api-client-react`; do not hand-write API types or bypass the shared client for core flows.

The protected workspace includes dashboard, medicines, medicine detail, dispense, alerts, history, and settings routes. Public routes are landing, login, and registration. Each mutation should invalidate its affected query keys so navigation and reloads show persisted state.

Safe UI changes include layout, typography, status presentation, empty states, and adding components that consume existing API hooks. Changes to dispense confirmation, stock status, and auth redirects must preserve the server contracts and should be checked against `docs/BUSINESS_LOGIC.md`.