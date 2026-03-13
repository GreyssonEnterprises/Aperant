# Comment: c6fd3c9adb04fed0

**Source:** github-advanced-security
**Type:** comment
**File:** `apps/desktop/src/renderer/components/gitlab-merge-requests/components/MRLogs.tsx`
**Line:** 54
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

**Resolution:** Type guard is correctly structured - typeof check precedes null check