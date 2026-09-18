#!/usr/bin/env python3
"""Run only on the host. The key is read without echo and stays outside the project."""
import getpass
import json
import os
from pathlib import Path

path = Path.home() / '.config/wrist-rhythm/mimo.json'
key = getpass.getpass('MiMo API Key (hidden): ').strip()
if not key:
    raise SystemExit('No key supplied; configuration unchanged')
path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
os.umask(0o077)
with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as stream:
    json.dump({'api_key': key}, stream)
os.chmod(path, 0o600)
print('Configuration saved privately. Key not displayed.')
