/**
 * PR Review Fixtures
 * ==================
 *
 * Pre-built PR context fixtures for testing different scenarios.
 * Use these to quickly set up realistic test data.
 */

import type { PRContext, ChangedFile, AIBotComment } from '../../main/ai/runners/github/pr-review-engine';

/**
 * Simple PR fixture for basic testing
 *
 * Small PR with 5 files and 50 additions.
 * Good for unit tests and quick sanity checks.
 */
export const SIMPLE_PR_CONTEXT: PRContext = {
  prNumber: 42,
  title: 'Fix user authentication bug',
  description: 'Fixes issue where users cannot log in with special characters in password',
  author: 'testuser',
  baseBranch: 'develop',
  headBranch: 'feature/auth-fix',
  state: 'open',
  changedFiles: [
    {
      path: 'src/auth/login.ts',
      additions: 15,
      deletions: 5,
      status: 'modified',
      patch: `@@ -10,7 +10,7 @@
 export function login(username: string, password: string): boolean {
-  if (!username || !password) return false;
+  if (!username || !password || password.length < 8) return false;
   const hash = hashPassword(password);`
    },
    {
      path: 'src/auth/password-validator.ts',
      additions: 20,
      deletions: 0,
      status: 'added',
      patch: `@@ -0,0 +1,20 @@
+export function validatePassword(password: string): boolean {
+  return password.length >= 8 &&
+         /[A-Z]/.test(password) &&
+         /[0-9]/.test(password);
+}`
    },
    {
      path: 'tests/auth/login.test.ts',
      additions: 10,
      deletions: 2,
      status: 'modified',
      patch: ''
    },
    {
      path: 'README.md',
      additions: 5,
      deletions: 0,
      status: 'modified',
      patch: ''
    }
  ] as ChangedFile[],
  diff: `diff --git a/src/auth/login.ts b/src/auth/login.ts
index 1234567..abcdefg 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -10,7 +10,7 @@
 export function login(username: string, password: string): boolean {
-  if (!username || !password) return false;
+  if (!username || !password || password.length < 8) return false;
   const hash = hashPassword(password);
`,
  diffTruncated: false,
  repoStructure: `
src/
├── auth/
│   ├── login.ts
│   ├── password-validator.ts
│   └── session.ts
├── utils/
│   └── hash.ts
└── tests/
    └── auth/
        └── login.test.ts
`,
  relatedFiles: ['src/auth/session.ts', 'src/utils/hash.ts'],
  commits: [
    {
      oid: 'abc123def456',
      messageHeadline: 'Fix password validation',
      committedDate: '2025-01-15T10:00:00Z'
    },
    {
      oid: '789ghi012jkl',
      messageHeadline: 'Add unit tests',
      committedDate: '2025-01-15T11:00:00Z'
    }
  ],
  labels: ['bug', 'authentication', 'priority-high'],
  totalAdditions: 50,
  totalDeletions: 7,
  aiBotComments: []
};

/**
 * Complex PR fixture for comprehensive testing
 *
 * Large PR with 100 files and 5000 additions.
 * Tests truncation, pagination, and performance handling.
 */
export const COMPLEX_PR_CONTEXT: PRContext = {
  prNumber: 123,
  title: 'Refactor payment processing system',
  description: 'Complete overhaul of payment processing with new provider integration',
  author: 'senior-dev',
  baseBranch: 'main',
  headBranch: 'feature/payment-refactor',
  state: 'open',
  changedFiles: Array.from({ length: 100 }, (_, i) => ({
    path: `src/payment/module-${i}.ts`,
    additions: 50,
    deletions: 10,
    status: i < 10 ? 'modified' : i < 50 ? 'added' : 'deleted',
    patch: i < 20 ? `@@ -1,5 +1,10 @@
 export class PaymentModule${i} {
-  constructor() {}
+  constructor(private config: PaymentConfig) {}
+  process(amount: number): Promise<boolean> {
+    return this.provider.charge(amount);
+  }
 }` : ''
  })) as ChangedFile[],
  diff: `[DIFF TRUNCATED - Too large to display]
  Total: 5000 additions, 1000 deletions across 100 files
  First 20 files shown in patches above...`,
  diffTruncated: true,
  repoStructure: `
src/
├── payment/
│   ├── modules/ (90 files)
│   ├── providers/
│   ├── validators/
│   └── utils/
├── billing/
│   ├── invoices/
│   └── subscriptions/
└── tests/
    ├── integration/
    └── unit/
`,
  relatedFiles: [
    'src/payment/providers/stripe.ts',
    'src/billing/invoices/generator.ts',
    'src/payment/validators/card.ts'
  ],
  commits: Array.from({ length: 25 }, (_, i) => ({
    oid: `commit${i}`,
    messageHeadline: `Commit ${i + 1}: Payment module updates`,
    committedDate: new Date(Date.now() - i * 3600000).toISOString()
  })),
  labels: ['refactor', 'payment', 'breaking-change', 'requires-testing'],
  totalAdditions: 5000,
  totalDeletions: 1000,
  aiBotComments: []
};

/**
 * PR with security vulnerability fixture
 *
 * Contains intentional security issues for testing detection.
 */
export const PR_WITH_SECURITY_ISSUE: PRContext = {
  prNumber: 456,
  title: 'Add API key configuration',
  description: 'Add environment variable support for API keys',
  author: 'junior-dev',
  baseBranch: 'develop',
  headBranch: 'feature/api-config',
  state: 'open',
  changedFiles: [
    {
      path: 'src/config/api.ts',
      additions: 8,
      deletions: 0,
      status: 'added',
      patch: `@@ -0,0 +1,8 @@
+export const API_KEY = '<REDACTED_API_KEY>';
+export const API_SECRET = '<REDACTED_SECRET>';
+
+export async function fetchAPI(endpoint: string) {
+  const response = await fetch(endpoint, {
+    headers: { 'Authorization': \`Bearer \${API_KEY}\` }
+  });
+  return response.json();
+}`
    },
    {
      path: 'src/database/query.ts',
      additions: 12,
      deletions: 0,
      status: 'added',
      patch: `@@ -0,0 +1,12 @@
+export async function getUserById(id: string) {
+  const query = \`SELECT * FROM users WHERE id = '\${id}'\`;
+  return db.execute(query);
+}
+
+export async function searchUsers(term: string) {
+  const query = \`SELECT * FROM users WHERE name LIKE '%\${term}%'\`;
+  return db.execute(query);
+}`
    },
    {
      path: 'src/auth/session.ts',
      additions: 5,
      deletions: 0,
      status: 'added',
      patch: `@@ -0,0 +1,5 @@
+export function createSession(userId: string) {
+  const token = btoa(userId + ':' + Date.now());
+  localStorage.setItem('session', token);
+  return token;
+}`
    }
  ] as ChangedFile[],
  diff: `diff --git a/src/config/api.ts b/src/config/api.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/config/api.ts
@@ -0,0 +1,8 @@
+export const API_KEY = '<REDACTED_API_KEY>';
+
diff --git a/src/database/query.ts b/src/database/query.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/database/query.ts
@@ -0,0 +1,12 @@
+export async function getUserById(id: string) {
+  const query = \`SELECT * FROM users WHERE id = '\${id}'\`;
+`,
  diffTruncated: false,
  repoStructure: `
src/
├── config/
│   └── api.ts
├── database/
│   └── query.ts
└── auth/
    └── session.ts
`,
  relatedFiles: [],
  commits: [
    {
      oid: 'abc123',
      messageHeadline: 'Add API configuration',
      committedDate: '2025-01-15T10:00:00Z'
    }
  ],
  labels: ['feature', 'api'],
  totalAdditions: 25,
  totalDeletions: 0,
  aiBotComments: []
};

/**
 * PR with AI bot comments for triage testing
 *
 * Contains comments from various AI review tools.
 */
export const PR_WITH_AI_COMMENTS: PRContext = {
  ...SIMPLE_PR_CONTEXT,
  prNumber: 789,
  aiBotComments: [
    {
      commentId: 1,
      author: 'coderabbitai',
      toolName: 'CodeRabbit',
      body: 'Consider adding error handling for the login function. What happens if hashPassword throws?',
      file: 'src/auth/login.ts',
      line: 12,
      createdAt: '2025-01-15T10:30:00Z'
    },
    {
      commentId: 2,
      author: 'cursor-agent',
      toolName: 'Cursor',
      body: 'The password validation logic is good but could be more strict. Consider requiring special characters.',
      file: 'src/auth/password-validator.ts',
      line: 3,
      createdAt: '2025-01-15T10:35:00Z'
    },
    {
      commentId: 3,
      author: 'greptile',
      toolName: 'Greptile',
      body: 'Minor nit: add JSDoc comments for public functions',
      file: 'src/auth/login.ts',
      createdAt: '2025-01-15T10:40:00Z'
    }
  ] as AIBotComment[]
};

/**
 * Empty PR fixture for edge case testing
 *
 * Minimal PR with no changes (good for error testing).
 */
export const EMPTY_PR_CONTEXT: PRContext = {
  prNumber: 999,
  title: 'Documentation update',
  description: 'Update README with new examples',
  author: 'doc-writer',
  baseBranch: 'main',
  headBranch: 'docs/update-readme',
  state: 'open',
  changedFiles: [] as ChangedFile[],
  diff: '',
  diffTruncated: false,
  repoStructure: '',
  relatedFiles: [],
  commits: [],
  labels: ['documentation'],
  totalAdditions: 0,
  totalDeletions: 0,
  aiBotComments: []
};
