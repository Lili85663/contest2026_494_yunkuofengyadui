#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/rhythm-work/tools/node/bin:$PATH"
systemctl --user start wrist-rhythm-mimo.service
exec node "$project_dir/scripts/contest-device.cjs" deploy
