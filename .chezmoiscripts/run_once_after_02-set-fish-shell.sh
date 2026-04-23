#!/bin/sh
FISH=/opt/homebrew/bin/fish
if ! grep -qF "$FISH" /etc/shells; then
  echo "$FISH" | sudo tee -a /etc/shells
fi
if [ "$SHELL" != "$FISH" ]; then
  chsh -s "$FISH"
fi
