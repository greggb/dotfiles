-- oxlint for projects without biome. Biome linting is handled by its LSP.

return {
    {
        "mfussenegger/nvim-lint",
        opts = function(_, opts)
            opts.linters_by_ft = opts.linters_by_ft or {}

            local ft_list = {
                "javascript",
                "javascriptreact",
                "typescript",
                "typescriptreact",
            }

            for _, ft in ipairs(ft_list) do
                opts.linters_by_ft[ft] = { "oxlint" }
            end
        end,
    },
}
