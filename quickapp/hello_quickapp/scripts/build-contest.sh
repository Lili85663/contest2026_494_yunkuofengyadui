#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/rhythm-work/tools/node/bin:$PATH"
cd "$project_dir"
npm test
# Isolated alternate profile; keep the default gateway edition unchanged.
stage=$(mktemp -d "$project_dir/build-contest.XXXXXX")
cleanup() {
  python3 - "$project_dir" "$stage" <<'PY'
import sys,shutil
from pathlib import Path
root=Path(sys.argv[1]).resolve(); target=Path(sys.argv[2]).resolve()
if target.parent != root or not target.name.startswith('build-contest.'):
    raise SystemExit('Refusing unexpected cleanup path')
shutil.rmtree(target)
PY
}
trap cleanup EXIT
cp -r src "$stage/src"
cp package.json package-lock.json "$stage/"
ln -s "$project_dir/node_modules" "$stage/node_modules"
profile="${1:-native}"
if [ "$profile" = gateway ]; then
  cp integrations/ai-provider.gateway.js "$stage/src/common/ai-provider.js"
elif [ "$profile" = native ]; then
  cp integrations/ai-provider.contest.js "$stage/src/common/ai-provider.js"
else
  echo '用法：build-contest.sh [native|gateway]'; exit 1
fi
cp integrations/health-provider.contest.js "$stage/src/common/health-provider.js"
python3 - "$stage/src/manifest.json" "$profile" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);m=json.loads(p.read_text())
for name in [('system.fetch' if sys.argv[2]=='gateway' else 'system.velaclaw'),'service.health']:
    if not any(x['name']==name for x in m['features']): m['features'].append({'name':name})
permissions=m.setdefault('permissions',[])
if not any(x['name']=='hapjs.permission.HEALTH' for x in permissions): permissions.append({'name':'hapjs.permission.HEALTH'})
p.write_text(json.dumps(m,ensure_ascii=False,indent=2))
PY
cd "$stage"
npm run build
output="$project_dir/dist-contest"
if [ "$profile" = gateway ]; then output="$project_dir/dist-gateway"; fi
mkdir -p "$output"
cp dist/*.rpk "$output/"
printf '接口版已构建，目录：%s\n' "$output"
