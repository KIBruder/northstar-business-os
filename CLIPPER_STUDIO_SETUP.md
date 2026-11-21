# CLIP-FINDER PRO — Studio UI

The dedicated Auto Clipper workspace is a mobile-responsive PWA companion interface for the local FastAPI engine.

## Open
Serve the repository root over HTTP (for example `python -m http.server 8000`) and open `/clipper-studio.html`.

## Hybrid connection
- On the machine hosting the engine, use `http://127.0.0.1:8765`.
- For iPhone access, run the engine on a trusted LAN host, set a random `CLIPPER_API_TOKEN` (32+ chars), bind to `0.0.0.0`, and enter the host LAN URL and token in the UI.
- Do not expose the engine directly to the public internet.

## Current scope
This UI implements engine health checks, project creation, large-file upload, and media metadata display. It deliberately does not present automatic highlight detection or clip rendering as available until the corresponding backend pipeline has been implemented and validated.
