# Comment: 18f7befb744bbebb

**Source:** coderabbitai
**Type:** comment
**File:** `apps/desktop/src/renderer/components/gitlab-issues/components/AutoFixButton.tsx`
**Line:** 72
**Original ID:** 2930292975
**Created:** None
**Severity:** HIGH
**Status:** RESOLVED

---

## Original Content

_⚠️ Potential issue_ | _🟠 Major_

**Error events are not filtered by issue, causing cross-talk between AutoFixButton instances.**

The `onGitLabAutoFixError` callback only receives `(projectId, error)` without an `issueIid` (as confirmed by the preload API type in `gitlab-api.ts:135-137`). This means when any auto-fix fails for a project, **all** `GitLabAutoFixButton` instances for that project will show the error, even if they weren't the ones processing.

Compare with `onGitLabAutoFixProgress` and `onGitLabAutoFixComplete` which properly filter by `issueIid`.



<details>
<summary>Suggested fix: Update the IPC API to include issueIid in error events</summary>

In the preload API (`gitlab-api.ts`), update the error callback signature:

```diff
  onGitLabAutoFixError: (
-   callback: (projectId: string, error: string) => void
+   callback: (projectId: string, issueIid: number, error: string) => void
  ) => IpcListenerCleanup;
```

Then update this listener:

```diff
  const cleanupError = window.electronAPI.onGitLabAutoFixError?.(
-   (eventProjectId: string, error: string) => {
-     if (eventProjectId === projectId) {
+   (eventProjectId: string, issueIid: number, errorMsg: string) => {
+     if (eventProjectId === projectId && issueIid === issue.iid) {
-       setError(error);
+       setError(errorMsg);
        setProgress(null);
        setIsStarting(false);
      }
    }
  );
```
</details>

<details>
<summary>🤖 Prompt for AI Agents</summary>

```
Verify each finding against the current code and only fix it if needed.

In
`@apps/desktop/src/renderer/components/gitlab-issues/components/AutoFixButton.tsx`
around lines 65 - 73, The error handler currently only filters by projectId
causing all AutoFixButton instances to receive unrelated errors; update the IPC
signature in gitlab-api.ts so onGitLabAutoFixError includes issueIid (e.g.,
(projectId: string, issueIid: string, error: string)), then update the listener
usage in AutoFixButton.tsx (window.electronAPI.onGitLabAutoFixError) to accept
and check issueIid === issue.iid in the callback before calling
setError/setProgress/setIsStarting; also update the emitter side that sends the
error IPC to include issueIid so the new signature is respected.
```

</details>

<!-- fingerprinting:phantom:poseidon:ocelot -->

<!-- This is an auto-generated comment by CodeRabbit -->

✅ Addressed in commits a44426e to 23b1f9c

---

## Suggested Fix

```typescript
Then update this listener:
```

---

## Implementation Notes

*Status: RESOLVED*

**Resolution:** Body contains resolution marker

**Resolved At:** 2026-03-13T14:15:46.435261

