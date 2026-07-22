# Codex Subscription Backend

## Requirements and support

Aperant uses the native executable from an installed OpenAI Codex CLI package. It doesn't
download or bundle Codex. The tested runtime line is `codex-cli 0.144.x`. Older versions are
rejected. Newer versions must pass the pinned app-server handshake and response validation before
models or execution become available.

macOS and Linux are supported. Windows stays disabled until Aperant can own the Codex process tree
with a Job Object. A Windows installation must fail closed instead of launching an uncontained
app-server.

## Accounts and migration

Add a **Codex Subscription** provider account, then complete the browser login started by that
account's isolated app-server. Aperant keeps one long-lived app-server and one private
`CODEX_HOME` per provider-account ID. Login and status use `account/login/start` and a fresh
`account/read`; tokens never cross renderer IPC. Login completion is correlated by account and
login ID, retained briefly in main, and acknowledged once by the renderer so a fast browser return
can't be lost between an event and UI state update.

Existing provider-account records are retained. Aperant doesn't import, rewrite, or delete legacy
Codex OAuth tokens. There is no environment-variable rollback to the legacy Vercel transport and
no automatic fallback. Recovery uses the isolated app-server account or a previous application
build.

## Sandbox and ownership boundary

Before the first turn in a worktree, Aperant uses the installed app-server's typed `command/exec`
RPC to run a deterministic capability probe. The probe must create an allowed marker while denying
both a sibling marker and a marker in the resolved Git directory. Denied attempts self-remove an
unexpectedly created marker before returning, and the host verifies cleanup. Ambiguous results,
timeouts, cleanup failures, or an unsupported platform stop execution.

Codex turns run with `workspace-write`, explicit writable roots, network disabled, approvals set to
`never`, and system temporary roots excluded. Codex owns edits, commands, and tests inside those
roots. Aperant remains the only owner of Git metadata, worktrees, commits, pushes, and pull
requests. A subscription model never falls back to the API-key/Vercel transport.

## Shutdown and recovery

Aperant closes app-server stdin and waits for a clean exit. It doesn't signal a process whose
ownership can't be proven. An unexpected exit, nonzero exit, signal, or shutdown timeout
quarantines that account for the rest of the application lifetime. A failed Codex ownership gate
keeps application quit blocked before legacy cleanup starts.

If cooperative shutdown fails, stop the Aperant Codex app-server in Activity Monitor or the system
process manager. Then force quit and relaunch Aperant. Provider-account records and isolated homes
remain available for recovery.

## Security notes

- Credentials, raw JSON-RPC errors, command output, and hidden reasoning aren't sent to renderers.
- App-server children receive a strict environment allowlist without provider keys or Sentry data.
- Catalog availability requires current authentication and fresh model discovery.
- Updating or deleting a subscription account is serialized per account. The record is re-read and
  ownership-checked after verified cooperative app-server retirement before any write or restart.
