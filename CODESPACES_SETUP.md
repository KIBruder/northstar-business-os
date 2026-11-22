# CLIP-FINDER PRO in GitHub Codespaces

This is the no-card cloud option. GitHub Free personal accounts include 120 Codespaces core-hours and 15 GB storage per month. A 2-core Codespace uses about 2 core-hours for each hour it runs (roughly 60 running hours monthly). Codespaces stop after 30 minutes idle by default. If the account has no payment method, usage is blocked once the included allowance is exhausted; no paid usage is enabled here.

## Start from an iPhone

1. Sign in to the personal GitHub account that owns `KIBruder/northstar-business-os`.
2. Open the repository, select branch `feat/clip-finder-pro-foundation`, and choose **Code → Codespaces → Create codespace on this branch**. Select the 2-core machine. Let the configured container finish installing FFmpeg and Python dependencies.
3. In the Codespace **Ports** panel, confirm port `8765` is **Private**. Open its forwarded HTTPS URL and append `/clipper-studio.html` if needed. The same URL serves Studio and API; the token is supplied only to this private Studio session.
4. Select a video and use the Studio. Uploads and exports live in `clipper-engine/data` inside the Codespace workspace, not the Git repository. Download finished clips to the iPhone.
5. Stop the Codespace from the GitHub Codespaces menu after the exports finish. Stopping it halts processing and preserves workspace files. The free allowance is limited, so avoid leaving it running.

## Limits

- The Codespace is on-demand, not always-on. Its forwarded URL works only while it is running and remains private to the signed-in GitHub user.
- Media processing consumes included Codespaces quota. If the account has a different plan, check its included quota first; do not attach a payment method or allow paid overage.
- Workspace storage is limited to the plan's included Codespaces storage. The Studio caps uploads at 1 GB per file; available free disk space may be lower. Keep space for both sources and exports.
- Whisper is not installed. Face framing uses OpenCV Haar frontal-face detection and may fail on profiles, occlusion, or small faces.
- Stopping preserves files in the repository workspace. Deleting the Codespace deletes its workspace data; download exports before deletion.
