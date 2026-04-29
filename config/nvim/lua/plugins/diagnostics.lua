return {
    {
        "LazyVim/LazyVim",
        opts = function()
            vim.diagnostic.config({
                virtual_text = {
                    spacing = 4,
                    source = "if_many",
                    prefix = "icons",
                },
                underline = true,
                update_in_insert = false,
                severity_sort = true,
                signs = {
                    text = {
                        [vim.diagnostic.severity.ERROR] = " ",
                        [vim.diagnostic.severity.WARN] = " ",
                        [vim.diagnostic.severity.HINT] = " ",
                        [vim.diagnostic.severity.INFO] = " ",
                    },
                },
                float = {
                    focusable = true,
                    border = "rounded",
                    source = true,
                    header = "",
                    prefix = "",
                },
            })
        end,
    },

    {
        "folke/trouble.nvim",
        opts = {
            focus = true,
        },
    },
}
