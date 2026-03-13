# Comment: cc9ad779af24bb5a

**Source:** coderabbitai
**Type:** comment
**File:** `apps/desktop/src/main/ipc-handlers/gitlab/mr-review-handlers.ts`
**Line:** 1054
**Original ID:** 2930292927
**Created:** None
**Severity:** HIGH
**Status:** RESOLVED

---

## Original Content

_⚠️ Potential issue_ | _🟠 Major_

**Invalidate the local posted-review cache when a note is deleted.**

This only deletes the remote GitLab note. The cached review JSON still keeps `has_posted_findings` / `posted_finding_ids`, so anything deriving local state from that cache will continue to treat the MR as posted after deletion. Either persist a `noteId -> findingIds` mapping and update the cache here, or force a cache refresh after the delete succeeds.

<details>
<summary>🤖 Prompt for AI Agents</summary>

```
Verify each finding against the current code and only fix it if needed.

In `@apps/desktop/src/main/ipc-handlers/gitlab/mr-review-handlers.ts` around lines
1004 - 1035, The delete handler for IPC_CHANNELS.GITLAB_MR_DELETE_REVIEW only
removes the remote note (in the ipcMain.handle block using withProjectOrNull,
encodeProjectPath and gitlabFetch) but does not update the local posted-review
cache; after a successful DELETE (before returning { success: true, data: {
deleted: true } }) invalidate or update the local cache: either remove the
noteId's entries from the posted-review cache (maintain or consult a noteId ->
findingIds mapping) or trigger a cache refresh for that project/MR (call your
existing cache refresh/invalidate function, e.g.
refreshPostedReviewsCache(project, mrIid) or
invalidatePostedReviewCache(project, mrIid)) so
has_posted_findings/posted_finding_ids are cleared when the remote note is
deleted.
```

</details>

<!-- fingerprinting:phantom:medusa:grasshopper -->

<!-- This is an auto-generated comment by CodeRabbit -->

✅ Addressed in commits a44426e to 23b1f9c

---

## Implementation Notes

*Status: RESOLVED*

**Resolution:** Body contains resolution marker

**Resolved At:** 2026-03-13T14:15:46.432192

