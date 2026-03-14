# Contributing to Auto Claude UI

Thank you for your interest in contributing! This document provides guidelines for contributing to the frontend application.

## Prerequisites

- **Node.js v24.12.0 LTS** - Download from https://nodejs.org
- **npm v10+** - Included with Node.js
- **Git** - For version control

## Getting Started

```bash
# Clone the repository
git clone https://github.com/AndyMik90/Auto-Claude.git
cd Auto-Claude/apps/desktop

# Install dependencies
npm install

# Start development server
npm run dev
```

## Code Style

### Architecture Principles

1. **Feature-based Organization**: Group related code in feature folders
2. **Single Responsibility**: Each file does one thing well
3. **DRY**: Extract common patterns into shared modules
4. **KISS**: Simple solutions over complex ones
5. **SOLID**: Follow object-oriented design principles

### Feature Module Structure

Each feature follows this structure:

```
features/[feature-name]/
├── components/        # Feature-specific React components
├── hooks/             # Feature-specific hooks
├── store/             # Zustand store
└── index.ts           # Public API exports
```

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| React Components | PascalCase | `TaskCard.tsx` |
| Hooks | camelCase with `use` | `useTaskStore.ts` |
| Stores | kebab-case | `task-store.ts` |
| Types | PascalCase | `Task.ts` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES` |

### Import Order

```typescript
// 1. External libraries
import { useState } from 'react';
import { Settings2 } from 'lucide-react';

// 2. Shared components and utilities
import { Button } from '@components/button';
import { cn } from '@lib/utils';

// 3. Feature imports
import { useTaskStore } from '../store/task-store';

// 4. Types (use 'import type')
import type { Task } from '@shared/types';
```

### TypeScript Guidelines

- **No implicit `any`**: Always type parameters and variables
- **Use `type` for objects**: Prefer `type` over `interface`
- **Export types separately**: Use `export type` for type-only exports

```typescript
// Good
type TaskStatus = 'backlog' | 'in_progress' | 'done';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

// Bad
function processTask(data: any) { ... }
```

## Testing

```bash
# Run unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# E2E tests
npm run test:e2e
```

### Writing Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskCard } from './TaskCard';

describe('TaskCard', () => {
  it('renders task title', () => {
    const task = { id: '1', title: 'Test Task' };
    render(<TaskCard task={task} onClick={vi.fn()} />);

    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });
});
```

## Before Submitting

1. **Run linting**:
   ```bash
   npm run lint:fix
   ```

2. **Check types**:
   ```bash
   npm run typecheck
   ```

3. **Run tests**:
   ```bash
   npm test
   ```

4. **Test the build**:
   ```bash
   npm run build
   ```

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes following the guidelines above
3. Commit with clear messages
4. Push and create a Pull Request
5. Address review feedback

## i18n and Translations

Auto Claude supports 21 languages. All user-facing text must use translation keys.

### Supported Languages

| Code | Language | Code | Language |
|------|----------|------|----------|
| `de` | German | `nl` | Dutch |
| `en` | English | `no` | Norwegian |
| `es` | Spanish | `pl` | Polish |
| `fr` | French | `pt-BR` | Portuguese (Brazil) |
| `hi` | Hindi | `pt-PT` | Portuguese (Portugal) |
| `id` | Indonesian | `ru` | Russian |
| `it` | Italian | `th` | Thai |
| `ja` | Japanese | `tr` | Turkish |
| `ko` | Korean | `uk` | Ukrainian |
| `vi` | Vietnamese | `zh-CN` | Chinese (Simplified) |
| | | `zh-TW` | Chinese (Traditional) |

### Adding or Updating Translations

**Translation files location:** `src/shared/i18n/locales/{lang}/*.json`

#### For Developers Adding New UI Text

1. **Never hardcode strings** in JSX/TSX components
2. **Use the `useTranslation` hook:**

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation(['common', 'settings']);

  return (
    <div>
      <h1>{t('common:welcome')}</h1>
      <p>{t('settings:description', { appName: 'Auto Claude' })}</p>
    </div>
  );
}
```

3. **Add keys to ALL 21 language files** - Copy the key structure to each language's JSON file
4. **Use namespace:section.key format** - e.g., `'settings:theme.dark'`
5. **Run validation:** `npm run validate:i18n`

#### For Translators Contributing Language Updates

1. **Find the language directory:** `src/shared/i18n/locales/{lang}/`
2. **Edit the appropriate namespace file** (e.g., `common.json`, `settings.json`)
3. **Follow these guidelines:**

   - **Preserve structure:** Keep the exact same JSON keys as English
   - **Keep placeholders:** Variables like `{{name}}` must appear in translation
   - **Match context:** Understand where the text appears before translating
   - **Consistent terminology:** Use the same term for the same concept
   - **Length awareness:** UI text should be ±30% of English length
   - **Formality:** Use appropriate formality level for your language's culture

4. **Validate your changes:**

```bash
# From repository root
npm run validate:i18n
```

5. **Test in the app:** Change language in Settings > Language and verify

### Adding a New Language

To contribute support for a language not yet available:

1. **Create language directory:**
   ```bash
   mkdir -p src/shared/i18n/locales/{lang}/
   ```

2. **Copy English templates:**
   ```bash
   cp src/shared/i18n/locales/en/*.json src/shared/i18n/locales/{lang}/
   ```

3. **Translate all files** in the new language directory

4. **Update i18n configuration** to include the new language code

5. **Validate:**
   ```bash
   npm run validate:i18n
   ```

6. **Submit a PR** with:
   - Language code and full language name
   - Translation completion percentage
   - Screenshot testing (if possible)

### Translation Namespaces

| Namespace | Purpose |
|-----------|---------|
| `common` | Reusable UI text (buttons, labels, etc.) |
| `navigation` | Menu items and navigation |
| `settings` | Settings page content |
| `dialogs` | Modal dialogs and alerts |
| `tasks` | Task management UI |
| `errors` | Error messages |
| `onboarding` | First-run experience |
| `welcome` | Welcome screen content |

### Validation Script

The `validate:i18n` script checks for:

- Missing translation keys across languages
- Inconsistent namespace structures
- Orphaned keys (defined but not used in code)
- JSON syntax errors

Run this before committing any translation changes.

## Security

- Never commit secrets, API keys, or tokens
- Use environment variables for sensitive data
- Validate all IPC data
- Use contextBridge for renderer-main communication

## Questions?

Open an issue or reach out to the maintainers.
