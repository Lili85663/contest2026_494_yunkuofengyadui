#!/usr/bin/env python3
"""Open the installed app in the official contest emulator."""
from pathlib import Path
import os, subprocess, shutil
root = Path(__file__).resolve().parent
node = Path.home() / 'rhythm-work/tools/node/bin/node'
subprocess.run(['systemctl', '--user', 'start', 'wrist-rhythm-mimo.service'], check=True)
os.execv(str(node) if node.exists() else shutil.which('node'), ['node', str(root / 'contest-device.cjs'), 'open'])
