#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LABEL="cn.ai-knowledgepoints.wechat-site-sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/ai-knowledgepoints"
PLUTIL_BIN="${PLUTIL_BIN:-plutil}"
LAUNCHCTL_BIN="${LAUNCHCTL_BIN:-launchctl}"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
escaped_project="${PROJECT_DIR//&/&amp;}"
escaped_home="${HOME//&/&amp;}"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$escaped_project/scripts/run-wechat-site-sync.sh</string></array>
  <key>WorkingDirectory</key><string>$escaped_project</string>
  <key>RunAtLoad</key><true/>
  <key>StartCalendarInterval</key><dict><key>Minute</key><integer>17</integer></dict>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>WECHAT_RSS_URL</key><string>http://127.0.0.1:8001/feed/MP_WXS_3212677307.rss?limit=50</string>
    <key>WECHAT_EXPECTED_FEED_ID</key><string>MP_WXS_3212677307</string>
  </dict>
  <key>StandardOutPath</key><string>$escaped_home/Library/Logs/ai-knowledgepoints/wechat-site-sync.log</string>
  <key>StandardErrorPath</key><string>$escaped_home/Library/Logs/ai-knowledgepoints/wechat-site-sync.error.log</string>
  <key>ProcessType</key><string>Background</string>
</dict></plist>
PLIST

"$PLUTIL_BIN" -lint "$PLIST"
"$LAUNCHCTL_BIN" bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
"$LAUNCHCTL_BIN" bootstrap "gui/$(id -u)" "$PLIST"
echo "已安装公众号到网站自动同步：每小时第 17 分钟运行，并在登录时补跑。"
echo "任务日志：$LOG_DIR/wechat-site-sync.log"
