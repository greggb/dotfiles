return {
    {
        "mason-org/mason.nvim",
        opts = {
            ensure_installed = {
                "shfmt",
            },
        },
    },

    {
        "windwp/nvim-ts-autotag",
        opts = {
            opts = {
                enable_close = true,
                enable_rename = true,
                enable_close_on_slash = true,
            },
        },
    },

    {
        "nvim-treesitter/nvim-treesitter",
        opts = {
            ensure_installed = {
                "css",
                "html",
                "javascript",
                "jsdoc",
                "json",
                "json5",
                "lua",
                "markdown",
                "markdown_inline",
                "regex",
                "scss",
                "tsx",
                "typescript",
                "vim",
                "vimdoc",
                "yaml",
            },
        },
    },
}
