# Repository Guidelines

## Project Structure & Module Organization

Aperant is an Electron application under `apps/desktop/`. Main-process services and IPC handlers live in `apps/desktop/src/main/`; the secure preload bridge is in `src/preload/`; React UI code is in `src/renderer/`; and cross-process constants and types belong in `src/shared/`. Keep unit and integration tests beside the code as `*.test.ts` or `*.test.tsx`; end-to-end coverage lives in `apps/desktop/e2e/`. Icons and packaging resources are in `apps/desktop/resources/`, while user-facing documentation belongs in `guides/`.

## Build, Test, and Development Commands

Run commands from the repository root unless noted:

- `npm run install:all` installs desktop dependencies (Node 24+ and npm 10+).
- `npm run dev` starts Electron with hot reload.
- `npm run build` creates the production bundles.
- `npm test` runs the Vitest suite once.
- `npm run lint` runs Biome checks.
- `cd apps/desktop; and npm run typecheck` runs strict TypeScript validation in fish.
- `cd apps/desktop; and npm run test:e2e` runs Playwright Electron tests after a build.
- `npm run package:mac` (or `:win`, `:linux`) builds platform installers.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, final newlines, and lines under 100 characters when practical. Prefer named exports and functional React components with hooks. Reuse components from `src/renderer/components/ui/`. Use PascalCase for components and types, camelCase for functions and variables, and kebab-case for service modules. Run Biome and type checking before committing.

## Testing Guidelines

Use Vitest and Testing Library for unit or component tests; use Playwright for end-to-end flows. Add regression coverage for fixes and tests for new behavior. Keep test names behavior-focused, such as `model-catalog-service.test.ts`. Run targeted tests while developing, then the full suite before review. Coverage must not decrease significantly.

## Commit & Pull Request Guidelines

Follow Conventional Commit prefixes used in history: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, or `chore:`. Keep subjects imperative and concise. Branch from and rebase onto `develop`. PRs need a clear rationale, linked issues, verification notes, and screenshots for UI changes. Flag AI-assisted work as required by `CONTRIBUTING.md`, and keep credentials or local configuration out of commits.
