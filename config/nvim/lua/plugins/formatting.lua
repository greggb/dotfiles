-- Project-aware formatting: biome when biome.json exists, oxfmt otherwise.
-- Both tools need to be installed globally (npm install -g @biomejs/biome oxfmt).

local function has_biome_config(ctx)
    return vim.fs.find(
        { "biome.json", "biome.jsonc" },
        { path = ctx.dirname, upward = true }
    )[1] ~= nil
end

return {
    {
        "stevearc/conform.nvim",
        opts = function(_, opts)
            opts.formatters_by_ft = opts.formatters_by_ft or {}

            local ft_list = {
                "javascript",
                "javascriptreact",
                "typescript",
                "typescriptreact",
                "json",
                "jsonc",
            }

            for _, ft in ipairs(ft_list) do
                opts.formatters_by_ft[ft] =
                    { "biome", "oxfmt", stop_after_first = true }
            end

            opts.formatters = vim.tbl_deep_extend(
                "force",
                opts.formatters or {},
                {
                    biome = {
                        condition = function(_, ctx)
                            return has_biome_config(ctx)
                        end,
                    },
                    oxfmt = {
                        condition = function(_, ctx)
                            return not has_biome_config(ctx)
                        end,
                    },
                }
            )
        end,
    },
}
