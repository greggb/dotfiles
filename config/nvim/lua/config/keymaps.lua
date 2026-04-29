-- Keymaps extend LazyVim defaults
-- see: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua

local map = vim.keymap.set

-- Error-only navigation (LazyVim has ]d/[d for all diagnostics)
map("n", "]e", function()
    vim.diagnostic.goto_next({
        severity = vim.diagnostic.severity.ERROR,
    })
end, { desc = "Next Error" })

map("n", "[e", function()
    vim.diagnostic.goto_prev({
        severity = vim.diagnostic.severity.ERROR,
    })
end, { desc = "Prev Error" })

-- Diagnostic float for current line
map("n", "gl", function()
    vim.diagnostic.open_float()
end, { desc = "Line Diagnostics" })

-- Trouble: errors-only view
map(
    "n",
    "<leader>xe",
    "<cmd>Trouble diagnostics toggle filter.severity=vim.diagnostic.severity.ERROR<cr>",
    { desc = "Errors (Trouble)" }
)
