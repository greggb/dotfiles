# Readable Pi footer

A personal Pi extension showing your directory, Git branch and session name,
then model and thinking level, context fullness, session token totals, latest
assistant prompt cache hit rate, and reported cost. Extension statuses remain on
an optional third line. Context turns warning-colored above 70% and error-colored
above 90%; unknown context shows `context recalculating`.

Narrow terminals progressively hide cache details, cost, token totals and thinking
level, keeping model and context until final terminal-width truncation.

Run `/footer` to toggle between the readable and built-in footer. The readable
footer starts enabled. This extension only installs its UI in TUI mode.

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

## Test

From this directory:

```sh
mise exec node@24.15.0 -- node --test tests/*.test.ts
```
