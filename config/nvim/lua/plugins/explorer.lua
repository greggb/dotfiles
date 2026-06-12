return {
  {
    "folke/snacks.nvim",
    opts = {
      explorer = {
        replace_netrw = true,
      },
      picker = {
        sources = {
          explorer = {
            hidden = true,
            ignored = false,
            filter = function(item)
              local dominated = {
                "node_modules",
                ".git",
                ".DS_Store",
                "__pycache__",
                ".next",
                ".turbo",
                ".cache",
                ".venv",
              }
              for _, name in ipairs(dominated) do
                if item.name == name then
                  return false
                end
              end
              return true
            end,
          },
          files = {
            hidden = true,
          },
          grep = {
            hidden = true,
          },
        },
      },
    },
  },
}
