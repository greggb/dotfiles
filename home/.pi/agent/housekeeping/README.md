# Pi housekeeping

Personal TypeScript extensions for Pi, loaded directly with jiti. No dependencies.

- `shared-instructions.ts` prepends `~/.agents/AGENTS.md` to structured system-prompt context on every run. Symlinks are supported, duplicates are skipped by path or realpath, and the guide must be a regular file no larger than 128 KiB. Failures warn once per session when a UI is available, without blocking the run.
- `prune.ts` starts one asynchronous cleanup per process at session startup. It deletes regular `.jsonl` files older than **30 days** from Pi's sessions directory (`$PI_CODING_AGENT_DIR/sessions`, default `~/.pi/agent/sessions`, never a custom `--session-dir`) and its immediate per-cwd subdirectories, and from `~/.pi/agent/subagent-logs` without recursion. It preserves the current session, skips symlinks, never removes directories (Pi writes session files lazily into a directory created at startup), and reports deletions or errors when a UI is available.

`/prune-sessions [days]` runs cleanup immediately. Retention defaults to 30 days; a numeric argument must be at least 1. Manual runs also report when nothing was deleted.

Both extensions are registered by explicit file path in `~/.pi/agent/settings.json`, not through automatic package discovery:

```json
{
  "extensions": [
    "~/.pi/agent/housekeeping/shared-instructions.ts",
    "~/.pi/agent/housekeeping/prune.ts"
  ]
}
```

Tests use disposable temporary fixtures, never real session or log directories:

```sh
mise exec node@24.15.0 -- env JITI_FS_CACHE=false node --test tests/*.test.ts tests/*.test.mjs
```

The installed-loader integration test uses the Pi runtime at `$PI_RUNTIME_DIR`, defaulting to `~/.local/share/pi-runtime`. Rerun it after upgrading Pi. There is no separate build, lint, or typecheck setup.
