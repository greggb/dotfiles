#!/usr/bin/env bash
set -euo pipefail

sudo nvram "StartupMute=%01" 2>/dev/null || true

/usr/libexec/PlistBuddy -c "Set :DesktopViewSettings:IconViewSettings:arrangeBy grid" \
  "$HOME/Library/Preferences/com.apple.finder.plist" 2>/dev/null || true

chflags nohidden "$HOME/Library" 2>/dev/null || true

defaults write com.apple.mail NSUserKeyEquivalents -dict-add "Send" "@\U21a9"
defaults write com.apple.mail DraftsViewerAttributes -dict-add "DisplayInThreadedMode" -string "yes"
defaults write com.apple.mail DraftsViewerAttributes -dict-add "SortedDescending" -string "yes"
defaults write com.apple.mail DraftsViewerAttributes -dict-add "SortOrder" -string "received-date"

for app in \
  "cfprefsd" \
  "Dock" \
  "Finder" \
  "Mail" \
  "Music" \
  "Safari" \
  "SystemUIServer"; do
  killall "$app" >/dev/null 2>&1 || true
done

echo "macOS defaults applied. Some changes may require a logout or restart."
