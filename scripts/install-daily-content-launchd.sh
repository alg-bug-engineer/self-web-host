#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LABEL="cn.ai-knowledgepoints.daily-content"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
CONFIG_DIR="$HOME/.config/ai-knowledgepoints"
LOG_DIR="$HOME/Library/Logs/ai-knowledgepoints"
PLUTIL_BIN="${PLUTIL_BIN:-plutil}"
LAUNCHCTL_BIN="${LAUNCHCTL_BIN:-launchctl}"

mkdir -p "$HOME/Library/LaunchAgents" "$CONFIG_DIR" "$LOG_DIR"
chmod 700 "$CONFIG_DIR"
if [[ ! -f "$CONFIG_DIR/publisher.env" ]]; then
  install -m 600 /dev/null "$CONFIG_DIR/publisher.env"
fi

escaped_project="${PROJECT_DIR//&/&amp;}"
escaped_home="${HOME//&/&amp;}"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$escaped_project/scripts/run-daily-content.sh</string></array>
  <key>WorkingDirectory</key><string>$escaped_project</string>
  <key>RunAtLoad</key><true/>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>30</integer></dict>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>PUBLISHER_ENV_FILE</key><string>$escaped_home/.config/ai-knowledgepoints/publisher.env</string>
    <key>CONTENT_AUTO_PUBLISH</key><string>false</string>
  </dict>
  <key>StandardOutPath</key><string>$escaped_home/Library/Logs/ai-knowledgepoints/daily-content.log</string>
  <key>StandardErrorPath</key><string>$escaped_home/Library/Logs/ai-knowledgepoints/daily-content.error.log</string>
  <key>ProcessType</key><string>Background</string>
</dict></plist>
PLIST

"$PLUTIL_BIN" -lint "$PLIST"
"$LAUNCHCTL_BIN" bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
"$LAUNCHCTL_BIN" bootstrap "gui/$(id -u)" "$PLIST"
echo "已安装登录时幂等补跑与每日 08:30 内容任务，并在 10:30、12:30 补偿重试：$PLIST"
echo "默认仅生成活动执行包；需要发布、合并与部署时，必须显式设置 CONTENT_AUTO_PUBLISH=true。"
echo "公众号凭据文件：$CONFIG_DIR/publisher.env"
