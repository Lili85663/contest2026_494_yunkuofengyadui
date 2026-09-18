#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d "$HOME/rhythm-work/tools/node/bin" ]; then
  export PATH="$HOME/rhythm-work/tools/node/bin:$PATH"
fi
cd "$project_dir"
npm test
python3 tests/gateway_test.py
npm run build
printf '\n构建完成。安装包位于 %s/dist/\n' "$project_dir"
