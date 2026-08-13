#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LABEL="cn.ai-knowledgepoints.search-console-sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
CONFIG_DIR="$HOME/.config/ai-knowledgepoints"
LOG_DIR="$HOME/Library/Logs/ai-knowledgepoints"
PLUTIL_BIN="${PLUTIL_BIN:-plutil}"
LAUNCHCTL_BIN="${LAUNCHCTL_BIN:-launchctl}"

mkdir -p "$HOME/Library/LaunchAgents" "$CONFIG_DIR" "$LOG_DIR"
chmod 700 "$CONFIG_DIR"
if [[ ! -f "$CONFIG_DIR/search-console-sync.env" ]]; then
  install -m 600 /dev/null "$CONFIG_DIR/search-console-sync.env"
fi

escaped_project="${PROJECT_DIR//&/&amp;}"
escaped_home="${HOME//&/&amp;}"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$escaped_project/scripts/run-search-console-sync.sh</string></array>
  <key>WorkingDirectory</key><string>$escaped_project</string>
  <key>RunAtLoad</key><true/>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>20</integer></dict>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>SEARCH_CONSOLE_SYNC_ENV_FILE</key><string>$escaped_home/.config/ai-knowledgepoints/search-console-sync.env</string>
  </dict>
  <key>StandardOutPath</key><string>$escaped_home/Library/Logs/ai-knowledgepoints/search-console-sync.log</string>
  <key>StandardErrorPath</key><string>$escaped_home/Library/Logs/ai-knowledgepoints/search-console-sync.error.log</string>
  <key>ProcessType</key><string>Background</string>
</dict></plist>
PLIST

"$PLUTIL_BIN" -lint "$PLIST"
"$LAUNCHCTL_BIN" bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
"$LAUNCHCTL_BIN" bootstrap "gui/$(id -u)" "$PLIST"
echo "已安装本机 Search Console 同步：每日 09:20 与登录后补跑。"
echo "同步配置：$CONFIG_DIR/search-console-sync.env"
