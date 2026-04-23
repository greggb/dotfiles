#!/bin/sh
# Install node via mise (config already applied by chezmoi), then global npm tools
/opt/homebrew/bin/mise install --quiet
/opt/homebrew/bin/mise exec node -- npm install -g oxlint oxfmt
