---
name: wrist-rhythm-check
description: Diagnose and verify wrist-rhythm AI, health replay, and simulator deployment on the configured Ubuntu openvela development host. Use for this project’s integration failures or release checks.
---

Use the user's selected connection mode. The default project's `@system.fetch` bridge is distinct from native `@system.velaclaw`; verify the runtime before changing adapters. A healthy gateway status is not proof that a particular model request succeeded.

1. Locate the actual project with `readlink -f /home/ma/wrist-rhythm`. It should point into the team's contest repository. Preserve current source and app data before replacing an installation.
2. Check `systemctl --user is-active wrist-rhythm-mimo.service` and the loopback `/status` response. Inspect only status and error codes, never the credential configuration or prompt/reply logs. The key lives outside the repository.
3. Diagnose failures by layer: emulator-to-host connectivity, immediate task submission, result polling, MiMo response, then application validation. Model generation can exceed the device fetch timeout; retain short submit/poll requests.
4. Inspect both the saved plan source and current connection state. A saved local fallback does not mean the gateway is currently down. Regenerate only when the current plan can safely be replaced.
5. Treat `service.health` data from the official beta image as replay. Verify timestamps and callbacks, not just a successful import. Expired samples must not trigger AI requests; do not label replay as a wearer measurement.
6. Exercise severe local pause independently of AI. AI health advice is optional, brief and non-diagnostic. Confirm that recovery, leaving the page, or disabling advice invalidates late replies; confirm request throttling.
7. Run `node tests/run.mjs` and `python3 tests/gateway_test.py`; then `bash scripts/build-app.sh` and `bash scripts/deploy-app.sh`. Deployment must close the old application before opening the exact manifest version.
8. Capture one actual on-device success and one relevant failure/cancellation case. Keep test-generated screenshots separate from claims about real wearable sensors. Record remaining native-agent or hardware limitations explicitly.

Use [the project README](../../../README.md) for evidence and remaining submission requirements. This skill does not authorize publishing logs, pushing commits, submitting PRs, or changing unrelated projects.
