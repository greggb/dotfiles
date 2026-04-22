# tmux Hotkey Reference

## `dev` Command

```
dev            # open session in current directory
dev <path>     # open session in given directory
```

Opens a tmux session named after the directory with three panes:

```
┌────────────────────┬──────────────┐
│                    │   claude     │
│      nvim .        ├──────────────┤
│                    │   shell      │
└────────────────────┴──────────────┘
   65% width              35%
```

If a session with that name already exists, `dev` reattaches to it instead of creating a new one.

---

## The PREFIX Key

**PREFIX = `Ctrl+Space`** (also `Ctrl+b` as a fallback)

To use a PREFIX binding:
1. Press and release **`Ctrl+Space`**
2. Then press the next key

**Example:** `PREFIX + v` means: press `Ctrl+Space`, release both, then press `v`.

Bindings shown as `Alt+X` or `Ctrl+Alt+X` do **not** need the PREFIX — press them directly.

The status bar shows **PREFIX** when tmux is waiting for your next key, and **COPY** when you're in copy mode.

---

## Panes

| Hotkey | Action |
|--------|--------|
| `PREFIX + v` | Split pane to the right (vertical split) |
| `PREFIX + h` | Split pane below (horizontal split) |
| `PREFIX + x` | Kill current pane |
| `PREFIX + z` | Toggle pane zoom (fullscreen / restore) |
| `Ctrl+Alt+←/→/↑/↓` | Move focus to pane in that direction |
| `Ctrl+Alt+Shift+←/→/↑/↓` | Resize current pane (5 cells at a time) |

---

## Windows

| Hotkey | Action |
|--------|--------|
| `PREFIX + c` | New window (opens in current directory) |
| `PREFIX + k` | Kill current window |
| `PREFIX + r` | Rename current window |
| `Alt+1` … `Alt+9` | Jump to window 1–9 |
| `Alt+←` | Previous window |
| `Alt+→` | Next window |
| `Alt+Shift+←` | Swap window left |
| `Alt+Shift+→` | Swap window right |

---

## Sessions

| Hotkey | Action |
|--------|--------|
| `PREFIX + C` | New session (opens in current directory) |
| `PREFIX + K` | Kill current session |
| `PREFIX + R` | Rename current session |
| `PREFIX + P` | Previous session |
| `PREFIX + N` | Next session |
| `PREFIX + s` | List all sessions (interactive picker) |
| `PREFIX + d` | Detach from session (leaves it running) |
| `Alt+↑` | Previous session |
| `Alt+↓` | Next session |

---

## Copy Mode (vi-style)

| Hotkey | Action |
|--------|--------|
| `PREFIX + [` | Enter copy mode (also works with scroll wheel) |
| `v` | Begin text selection |
| `y` | Copy selection → macOS clipboard, exit copy mode |
| `q` or `Escape` | Exit copy mode |
| `h/j/k/l` | Move cursor (vi-style) |
| `/` | Search forward |
| `?` | Search backward |
| `n/N` | Next/previous search match |

Copied text goes directly to `pbcopy` (macOS clipboard).

---

## General

| Hotkey | Action |
|--------|--------|
| `PREFIX + q` | Reload tmux config |
| `PREFIX + :` | Open tmux command prompt |
| `PREFIX + ?` | List all keybindings |
| `PREFIX + t` | Show clock |

---

## Tips

**Zoom a pane to fullscreen**
Press `PREFIX + z` to expand the current pane to fill the window. Press again to restore the layout.

**Resize panes**
Hold `Ctrl+Alt+Shift` and tap an arrow key. Each press moves the border by 5 cells. Or drag pane borders with the mouse.

**Mouse support**
Mouse is enabled: click to focus a pane, drag borders to resize, scroll to move through history. Hold `Option` while clicking to select text without tmux intercepting it (for terminal copy-paste).

**Open a new project**
From anywhere inside tmux: `PREFIX + C` creates a new session. Or run `dev ~/path/to/project` from any shell pane — it will create a new session and switch you to it.

**New window for a quick task**
`PREFIX + c` opens a new window in the current directory, keeping your dev layout intact. Use `Alt+1`/`Alt+2` etc. to jump back.

**Detach without losing your work**
`PREFIX + d` detaches from the session. Everything keeps running. Run `dev` again later to reattach.

**Config location**
`~/.config/tmux/tmux.conf` — edit then `PREFIX + q` to reload without restarting.
