return {
    {
        "neovim/nvim-lspconfig",
        opts = {
            inlay_hints = { enabled = true },
            servers = {
                -- TypeScript (configured by lang.typescript extra, we add settings)
                vtsls = {
                    settings = {
                        typescript = {
                            preferences = {
                                importModuleSpecifier = "non-relative",
                            },
                            inlayHints = {
                                parameterNames = {
                                    enabled = "literals",
                                },
                                parameterTypes = { enabled = true },
                                variableTypes = { enabled = true },
                                propertyDeclarationTypes = {
                                    enabled = true,
                                },
                                functionLikeReturnTypes = {
                                    enabled = true,
                                },
                                enumMemberValues = { enabled = true },
                            },
                        },
                        javascript = {
                            inlayHints = {
                                parameterNames = {
                                    enabled = "literals",
                                },
                                parameterTypes = { enabled = true },
                                variableTypes = { enabled = true },
                                propertyDeclarationTypes = {
                                    enabled = true,
                                },
                                functionLikeReturnTypes = {
                                    enabled = true,
                                },
                                enumMemberValues = { enabled = true },
                            },
                        },
                    },
                    keys = {
                        {
                            "<leader>co",
                            LazyVim.lsp.action["source.organizeImports"],
                            desc = "Organize Imports",
                        },
                        {
                            "<leader>cR",
                            function()
                                LazyVim.lsp.execute({
                                    command = "typescript.renameFile",
                                    arguments = {
                                        {
                                            sourceUri = vim.uri_from_bufnr(0),
                                        },
                                    },
                                })
                            end,
                            desc = "Rename File",
                        },
                        {
                            "<leader>cD",
                            LazyVim.lsp.action[
                                "source.removeUnused.ts"
                            ],
                            desc = "Remove Unused",
                        },
                    },
                },

                -- Biome LSP: auto-attaches when biome.json is found
                biome = {},
            },
        },
    },
}
