### Custom Keybindings

These are defined in our config (not LazyVim defaults).

#### Diagnostics (keymaps.lua)

    ]e          Next error (skips warnings/hints)
    [e          Prev error
    gl          Show diagnostic float for current line
    <space>xe   Trouble: errors only

#### TypeScript (lsp.lua)

    <space>co   Organize imports
    <space>cR   Rename file
    <space>cD   Remove unused imports

### LazyVim Built-ins

Press `<space>` and wait for which-key to show all available commands.

#### Navigation

    gd          Go to definition
    gr          Go to references
    gI          Go to implementation
    gy          Go to type definition
    K           Hover docs (type info, docs)
    ]d / [d     Next / prev diagnostic (all severities)

#### Code Actions

    <space>ca   Code actions
    <space>cr   Rename symbol
    <space>cf   Format document

#### Search (snacks picker)

    <space>ff   Find files
    <space>fg   Live grep
    <space>fb   Buffers
    <space>fr   Recent files
    <space>fs   Search symbols in file

#### Trouble (diagnostics panel)

    <space>xx   Toggle Trouble (all diagnostics)
    <space>xX   Buffer diagnostics
    <space>xL   Location list
    <space>xQ   Quickfix list

#### Toggles

    <space>uh   Toggle inlay hints
    <space>ut   Toggle treesitter context (sticky function header)
    <space>ud   Toggle diagnostics
    <space>uw   Toggle word wrap
    <space>ul   Toggle line numbers
    <space>uL   Toggle relative line numbers

#### AI

    <space>ac   Toggle Claude Code terminal
    <space>af   Focus Claude Code
    <space>ar   Resume Claude Code (--resume)
    <space>aC   Continue Claude Code (--continue)
    <space>ab   Add current buffer to Claude
    <space>as   Send selection to Claude (visual mode)

#### Git

    <space>gg   Open lazygit
    ]h / [h     Next / prev hunk (gitsigns)
    <space>ghs  Stage hunk
    <space>ghr  Reset hunk
    <space>ghp  Preview hunk

#### Windows and Buffers

    <space>bd   Delete buffer
    <space>bo   Delete other buffers
    H / L       Prev / next buffer
    <C-h/j/k/l> Navigate splits
