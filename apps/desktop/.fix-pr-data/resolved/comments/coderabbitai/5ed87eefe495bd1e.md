# Comment: 5ed87eefe495bd1e

**Source:** coderabbitai
**Type:** comment
**File:** `apps/desktop/src/preload/api/modules/github-api.ts`
**Line:** 606
**Original ID:** 2930418391
**Created:** None
**Severity:** CRITICAL
**Status:** SKIPPED

---

## Original Content

_⚠️ Potential issue_ | _🔴 Critical_

<details>
<summary>🧩 Analysis chain</summary>

🏁 Script executed:

```shell
#!/bin/bash
# Check what the main process handler expects for the preflight channel
rg -n "preflightCheck|preflight" --type ts -g '!*.test.ts' -g '!*.spec.ts' apps/desktop/src/main apps/desktop/src/shared/constants
```

Repository: AndyMik90/Aperant

Length of output: 147

---

🏁 Script executed:

```shell
#!/bin/bash
# Get all RELEASE_* constants from ipc.ts
rg -n "RELEASE_" --type ts apps/desktop/src/shared/constants/ipc.ts | head -20
```

Repository: AndyMik90/Aperant

Length of output: 298

---

🏁 Script executed:

```shell
#!/bin/bash
# Check what the main process release handlers are registered as
rg -n "release:" --type ts -A 2 -B 2 apps/desktop/src/main/ipc-handlers | grep -E "(handle|on|register|release:)" | head -20
```

Repository: AndyMik90/Aperant

Length of output: 563

---

🏁 Script executed:

```shell
#!/bin/bash
# Check the actual imports and usage in github-api.ts at the specific lines
sed -n '1,20p' apps/desktop/src/preload/api/modules/github-api.ts
tail -n +580 apps/desktop/src/preload/api/modules/github-api.ts | head -30
```

Repository: AndyMik90/Aperant

Length of output: 1658

---

🏁 Script executed:

```shell
#!/bin/bash
# Search for handler registrations in main process for release channels
rg -n "handle|\.on\(" --type ts apps/desktop/src/main/ipc-handlers -A 3 | grep -E "(release:preflight|release:preflightCheck|preflightCheck)" -B 3 -A 3
```

Repository: AndyMik90/Aperant

Length of output: 43

---

🏁 Script executed:

```shell
#!/bin/bash
# Check the release handler files more thoroughly
find apps/desktop/src/main/ipc-handlers -name "*release*" -type f
```

Repository: AndyMik90/Aperant

Length of output: 184

---

🏁 Script executed:

```shell
#!/bin/bash
# Check the github release handlers to see what channels are registered
cat -n apps/desktop/src/main/ipc-handlers/github/release-handlers.ts | head -100
```

Repository: AndyMik90/Aperant

Length of output: 3781

---

🏁 Script executed:

```shell
#!/bin/bash
# Search specifically for ipcMain.handle or channel registration in release handlers
rg -n "ipcMain|handle|preflight|preflightCheck" --type ts apps/desktop/src/main/ipc-handlers/github/release-handlers.ts
```

Repository: AndyMik90/Aperant

Length of output: 228

---

🏁 Script executed:

```shell
#!/bin/bash
# Check what handler is registered at line 189 and around line 261
sed -n '185,200p' apps/desktop/src/main/ipc-handlers/github/release-handlers.ts
```

Repository: AndyMik90/Aperant

Length of output: 592

---

🏁 Script executed:

```shell
#!/bin/bash
# Check the handler registration section around line 261
sed -n '260,330p' apps/desktop/src/main/ipc-handlers/github/release-handlers.ts
```

Repository: AndyMik90/Aperant

Length of output: 216

---

🏁 Script executed:

```shell
#!/bin/bash
# Search for any handlers registered for the release channels that appear in preload
rg -n "RELEASE_GET_VERSIONS|RELEASE_CREATE|RELEASE_PREFLIGHT" --type ts apps/desktop/src/main
```

Repository: AndyMik90/Aperant

Length of output: 43

---

🏁 Script executed:

```shell
#!/bin/bash
# Check if there are handlers for getReleaseableVersions, runReleasePreflightCheck, or createRelease
rg -n "getReleaseableVersions|getVersions|preflightCheck|preflight" --type ts apps/desktop/src/main/ipc-handlers
```

Repository: AndyMik90/Aperant

Length of output: 43

---

🏁 Script executed:

```shell
#!/bin/bash
# Check all IPC handlers being registered globally
rg -n "ipcMain\.handle|registerReleaseHandlers|registerCreateRelease" --type ts apps/desktop/src/main
```

Repository: AndyMik90/Aperant

Length of output: 29490

---

🏁 Script executed:

```shell
#!/bin/bash
# Check the main.ts or index to see which handlers are registered
find apps/desktop/src/main -maxdepth 2 -name "*.ts" | xargs grep -l "registerReleaseHandlers\|ipcMain"
```

Repository: AndyMik90/Aperant

Length of output: 1447

---

🏁 Script executed:

```shell
#!/bin/bash
# Check if there's a comprehensive handler registration file
cat -n apps/desktop/src/main/index.ts 2>/dev/null || cat -n apps/desktop/src/main/main.ts 2>/dev/null || find apps/desktop/src/main -maxdepth 1 -name "*.ts" -exec echo {} \; -exec cat {} \;
```

Repository: AndyMik90/Aperant

Length of output: 32539

---

🏁 Script executed:

```shell
#!/bin/bash
# Search for calls to these three preload methods from renderer
rg -n "getReleaseableVersions|runReleasePreflightCheck" --type ts -g '!*.test.ts' apps/desktop/src/renderer
```

Repository: AndyMik90/Aperant

Length of output: 858

---

🏁 Script executed:

```shell
#!/bin/bash
# Check if there are any handlers registered for these channels in the entire main process
find apps/desktop/src/main -name "*.ts" ! -name "*.test.ts" -exec grep -l "release:getVersions\|release:preflightCheck\|release:preflight" {} \;
```

Repository: AndyMik90/Aperant

Length of output: 43

---

🏁 Script executed:

```shell
#!/bin/bash
# Look for where the release handlers are being called/imported
rg -n "registerReleaseHandlers" --type ts apps/desktop/src/main
```

Repository: AndyMik90/Aperant

Length of output: 771

---

🏁 Script executed:

```shell
#!/bin/bash
# Check if any of these handlers are actually defined anywhere in main process
# Search for handler definitions for these channels
rg -n "RELEASE_GET_VERSIONS|RELEASE_PREFLIGHT|RELEASE_CREATE" --type ts apps/desktop/src/main/ipc-handlers | grep "handle\|ipcMain"
```

Repository: AndyMik90/Aperant

Length of output: 43

---

🏁 Script executed:

```shell
#!/bin/bash
# Verify what handlers ARE registered in github release-handlers.ts
cat -n apps/desktop/src/main/ipc-handlers/github/release-handlers.ts | grep -A 2 "ipcMain.handle"
```

Repository: AndyMik90/Aperant

Length of output: 312

---

🏁 Script executed:

```shell
#!/bin/bash
# Final verification: confirm no handlers exist for these three channels
rg -n "RELEASE_GET_VERSIONS|'release:getVersions'" --type ts apps/desktop/src/main/ipc-handlers
```

Repository: AndyMik90/Aperant

Length of output: 43

---

🏁 Script executed:

```shell
#!/bin/bash
# Check what happens when a non-existent channel is called
rg -n "ipcMain.handle.*RELEASE" --type ts apps/desktop/src/main/ipc-handlers/github/release-handlers.ts
```

Repository: AndyMik90/Aperant

Length of output: 43

---



</details>

**Use IPC_CHANNELS constants and fix missing handlers; these preload methods will fail at runtime.**

Three critical issues in the release operations API:

1. **Hardcoded strings (lines 594, 597, 606)**: Import and use `IPC_CHANNELS` constants instead of string literals to match the established pattern.

2. **Channel name mismatch (line 597)**: Preload uses `'release:preflightCheck'` but the constant in `ipc.ts` is `RELEASE_PREFLIGHT: 'release:preflight'`. This will cause IPC calls to fail silently since no handler is registered.

3. **Missing main process handlers**: The renderer actively calls `getReleaseableVersions()` and `runReleasePreflightCheck()` from `release-store.ts`, but no corresponding `ipcMain.handle()` registrations exist for `RELEASE_GET_VERSIONS` or `RELEASE_PREFLIGHT` channels. The methods are dead in the main process.

These calls will hang/fail at runtime. Register handlers in `apps/desktop/src/main/ipc-handlers/github/release-handlers.ts` (and GitLab equivalent) and use the correct channel constants.

<details>
<summary>Proposed fix</summary>

```diff
  // Release operations (changelog-based)
  getReleaseableVersions: (projectId: string): Promise<IPCResult<unknown>> =>
-   invokeIpc('release:getVersions', projectId),
+   invokeIpc(IPC_CHANNELS.RELEASE_GET_VERSIONS, projectId),

  runReleasePreflightCheck: (projectId: string, version: string): Promise<IPCResult<unknown>> =>
-   invokeIpc('release:preflightCheck', projectId, version),
+   invokeIpc(IPC_CHANNELS.RELEASE_PREFLIGHT, projectId, version),

  createRelease: (options: {
    projectId: string;
    version: string;
    body: string;
    draft?: boolean;
    prerelease?: boolean;
  }): Promise<IPCResult<unknown>> =>
-   invokeIpc('release:create', options),
+   invokeIpc(IPC_CHANNELS.RELEASE_CREATE, options),
```

</details>

<details>
<summary>🤖 Prompt for AI Agents</summary>

```
Verify each finding against the current code and only fix it if needed.

In `@apps/desktop/src/preload/api/modules/github-api.ts` around lines 592 - 606,
Replace the hardcoded channel strings in the preload methods
getReleaseableVersions, runReleasePreflightCheck and createRelease to use the
IPC_CHANNELS constants (e.g. IPC_CHANNELS.RELEASE_GET_VERSIONS,
IPC_CHANNELS.RELEASE_PREFLIGHT, IPC_CHANNELS.RELEASE_CREATE) and correct the
name mismatch for the preflight channel to use RELEASE_PREFLIGHT; then register
handlers in the main process by adding ipcMain.handle(...) for
IPC_CHANNELS.RELEASE_GET_VERSIONS and IPC_CHANNELS.RELEASE_PREFLIGHT inside the
release-handlers.ts (and the GitLab equivalent) so the calls from
release-store.ts resolve (ensure handler function names and signatures match the
invoke args used by the preload methods).
```

</details>

<!-- fingerprinting:phantom:poseidon:ocelot -->

<!-- This is an auto-generated comment by CodeRabbit -->

---

## Suggested Fix

```typescript
</details>

<details>
<summary>🤖 Prompt for AI Agents</summary>
```

---

## Implementation Notes

*Status: SKIPPED*

**Resolution:** CRITICAL architectural issue: preload calls 'release:create' but handler is registered on 'github:createRelease'. Also missing handlers for RELEASE_GET_VERSIONS and RELEASE_PREFLIGHT. This requires significant refactoring of the GitHub release system architecture. Recommend separate issue/PR to resolve these mismatches and implement missing handlers.