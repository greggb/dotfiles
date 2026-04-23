return {
  -- TypeScript LSP via typescript-tools: inlay hints + file operations
  {
    "pmizio/typescript-tools.nvim",
    opts = function(_, opts)
      opts.settings = vim.tbl_deep_extend("force", opts.settings or {}, {
        tsserver_file_preferences = {
          includeInlayParameterNameHints = "literals",
          includeInlayParameterNameHintsWhenArgumentMatchesName = false,
          includeInlayFunctionParameterTypeHints = true,
          includeInlayVariableTypeHints = true,
          includeInlayVariableTypeHintsWhenTypeMatchesName = false,
          includeInlayPropertyDeclarationTypeHints = true,
          includeInlayFunctionLikeReturnTypeHints = true,
          includeInlayEnumMemberValueHints = true,
        },
      })
      local prev = opts.on_attach
      opts.on_attach = function(client, bufnr)
        if prev then prev(client, bufnr) end
        local map = function(key, cmd, desc)
          vim.keymap.set("n", key, cmd, { buffer = bufnr, desc = desc })
        end
        map("<leader>co", "<cmd>TSToolsOrganizeImports<cr>", "Organize Imports")
        map("<leader>cR", "<cmd>TSToolsRenameFile<cr>", "Rename File")
        map("<leader>cD", "<cmd>TSToolsRemoveUnused<cr>", "Remove Unused")
      end
    end,
  },

  -- Format JS/TS with oxfmt (Prettier-compatible, 30x faster)
  -- Requires: npm install -g oxfmt
  {
    "stevearc/conform.nvim",
    opts = function(_, opts)
      opts.formatters_by_ft = opts.formatters_by_ft or {}
      for _, ft in ipairs({ "javascript", "javascriptreact", "typescript", "typescriptreact", "json" }) do
        opts.formatters_by_ft[ft] = { "oxfmt" }
      end
    end,
  },

  -- Lint JS/TS with oxlint (fast Rust-based linter)
  -- Requires: npm install -g oxlint
  {
    "mfussenegger/nvim-lint",
    opts = function(_, opts)
      opts.linters_by_ft = opts.linters_by_ft or {}
      for _, ft in ipairs({ "javascript", "javascriptreact", "typescript", "typescriptreact" }) do
        opts.linters_by_ft[ft] = { "oxlint" }
      end
    end,
  },
}
