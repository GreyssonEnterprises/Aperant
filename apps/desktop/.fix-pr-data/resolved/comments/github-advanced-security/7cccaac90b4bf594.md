# Comment: 7cccaac90b4bf594

**Source:** github-advanced-security
**Type:** comment
**File:** `apps/desktop/src/renderer/components/gitlab-merge-requests/components/MRLogs.tsx`
**Original ID:** 2930695525
**Created:** None
**Severity:** CRITICAL
**Status:** SKIPPED

---

## Original Content

## Comparison between inconvertible types

Variable 'logs' is of type date, object or regular expression, but it is compared to [an expression](1) of type null.

[Show more details](https://github.com/AndyMik90/Aperant/security/code-scanning/5592)

---

## Implementation Notes

*Status: SKIPPED*

**Resolution:** False positive - logs is correctly typed as GitLabMRLogs | null, null check is valid