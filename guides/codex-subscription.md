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
`account/read`; tokens never cross renderer IPC.

Existing provider-account records are retained. Aperant doesn't import, rewrite, or delete legacy
Codex OAuth tokens. The old transport is available only for internal rollback when
`APERANT_ENABLE_LEGACY_CODEX_OAUTH=1` is set before launch. It is off by default and must not be
used as an automatic fallback.

## Sandbox and ownership boundary

Before the first turn in a worktree, Aperant uses the installed app-server's typed `command/exec`
RPC to run a deterministic capability probe. The probe must create an allowed marker while denying
both an outside marker and a `.git` marker. Ambiguous results, timeouts, cleanup failures, or an
unsupported platform stop execution.

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
- Deleting a subscription account first requires verified cooperative app-server retirement.
