# Comment: 7a055cefa89abc2b

**Source:** coderabbitai
**Type:** comment
**File:** `apps/desktop/src/main/ipc-handlers/gitlab/mr-review-handlers.ts`
**Line:** 69
**Original ID:** 2930575631
**Created:** None
**Severity:** HIGH
**Status:** PENDING

---

## Original Content

_⚠️ Potential issue_ | _🟠 Major_

<details>
<summary>🧩 Analysis chain</summary>

🏁 Script executed:

```shell
#!/bin/bash
# Verify clearPollingForProject is not called anywhere
rg "clearPollingForProject" apps/desktop/src/main/ -l
```

Repository: AndyMik90/Aperant

Length of output: 124

---

🏁 Script executed:

```shell
#!/bin/bash
# Check if clearPollingForProject is exported from mr-review-handlers.ts
rg "export.*clearPollingForProject|clearPollingForProject.*export" apps/desktop/src/main/ipc-handlers/gitlab/mr-review-handlers.ts
```

Repository: AndyMik90/Aperant

Length of output: 95

---

🏁 Script executed:

```shell
#!/bin/bash
# Check PROJECT_REMOVE handler in project-handlers.ts
rg -A 10 "PROJECT_REMOVE" apps/desktop/src/main/ipc-handlers/
```

Repository: AndyMik90/Aperant

Length of output: 2023

---

🏁 Script executed:

```shell
#!/bin/bash
# Check mainWindow close handler in main/index.ts
rg -B 5 -A 10 "mainWindow\.on\('closed" apps/desktop/src/main/
```

Repository: AndyMik90/Aperant

Length of output: 1029

---



</details>

**Polling cleanup not integrated into project/window lifecycle.**

`clearPollingForProject` is defined and exported but never called when:
1. A project is removed (`PROJECT_REMOVE` handler in `project-handlers.ts`)
2. The main window closes (`mainWindow.on('closed')` in `main/index.ts`)

This causes memory leaks as polling intervals accumulate indefinitely. Add calls to `clearPollingForProject` in both locations: import it in `project-handlers.ts` and call it within the PROJECT_REMOVE handler, and import it in `main/index.ts` and call it in the mainWindow close handler.

<details>
<summary>🤖 Prompt for AI Agents</summary>

```
Verify each finding against the current code and only fix it if needed.

In `@apps/desktop/src/main/ipc-handlers/gitlab/mr-review-handlers.ts` around lines
49 - 68, Add calls to clearPollingForProject when a project is removed and when
the main window closes: import clearPollingForProject from the MR review
handlers module into project-handlers.ts and invoke
clearPollingForProject(projectId) inside the PROJECT_REMOVE handler (using the
same projectId the handler removes), and also import clearPollingForProject into
main/index.ts and call clearPollingForProject for the relevant project(s) inside
mainWindow.on('closed') before or after other cleanup to ensure any timers in
statusPollingIntervals are cleared. Ensure the imported symbol name matches
clearPollingForProject and that you handle cases where projectId may be
undefined/nullable.
```

</details>

<!-- fingerprinting:phantom:medusa:ocelot -->

<!-- This is an auto-generated comment by CodeRabbit -->

---

## Implementation Notes

*Status: PENDING - Not yet verified or implemented*

### Verification Checklist

- [ ] Read file at comment location
- [ ] Verify if issue is already fixed
- [ ] Implement fix if needed
- [ ] Re-verify after implementation

