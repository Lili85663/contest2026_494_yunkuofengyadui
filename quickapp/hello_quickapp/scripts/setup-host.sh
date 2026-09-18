#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$HOME/.config/systemd/user"
python3 - "$project_dir" <<'PYSETUP'
from pathlib import Path
import sys
script=Path(sys.argv[1])/'scripts/mimo-gateway.py'
if any(c in str(script) for c in ['\n','\r','"','%']):
    raise SystemExit('Please use a project path without newline, quote or percent characters')
unit='[Unit]\nDescription=Wrist Rhythm local MiMo gateway\nAfter=network.target\n\n[Service]\nType=simple\nExecStart=/usr/bin/python3 "'+str(script)+'"\nRestart=on-failure\nRestartSec=3\n\n[Install]\nWantedBy=default.target\n'
(Path.home()/'.config/systemd/user/wrist-rhythm-mimo.service').write_text(unit)
PYSETUP
systemctl --user daemon-reload
systemctl --user enable --now wrist-rhythm-mimo.service
printf 'MiMo 本机服务已安装。首次使用请运行 python3 scripts/configure-mimo.py，再重启服务。\n'
