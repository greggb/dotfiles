# Compact Pi status bar

A Claude Code-inspired footer using Pi's active theme.
Run `/footer` to toggle between the compact and built-in status bar.
The compact status bar starts enabled and only installs its UI in TUI mode.

## Load

Add the explicit file path to the existing `extensions` array in
`~/.pi/agent/settings.json`, preserving other entries:

```json
{
  "extensions": ["/Users/gregg.brewster/.pi/agent/footer/readable-footer.ts"]
}
```

Run `/reload` in Pi after registering it. TypeScript loads through Pi's jiti
loader, with no compilation step or added dependencies. Reported cost is the
provider's usage estimate, not a subscription billing statement.
A cache timer marked `left` estimates expiry from the model's declared lifetime.
A timer marked `ago` shows request age, not proof that the cache is warm or cold.

## Test

From this directory:

```sh
mise exec node@24.15.0 -- npm test
```
