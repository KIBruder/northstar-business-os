# CLIP-FINDER PRO on Render Free (no card)

This fallback uses one Render Free Docker web service in Frankfurt. The Blueprint pins `plan: free`, disables auto-deploys, generates a random 256-bit API token in Render, and caps uploads at 100 MiB. No payment method is configured here.

## Deploy

1. Sign in to Render and choose **New → Blueprint** for the public repository `KIBruder/northstar-business-os`. Select branch `feat/clip-finder-pro-foundation` and `render.yaml`.
2. Before applying, verify the service plan is **Free**, region **Frankfurt**, and the only service is `clip-finder-pro`. Do not add a card, upgrade the workspace, or select a paid plan.
3. Apply the Blueprint and wait for the Docker build and deploy to finish. The generated `CLIPPER_API_TOKEN` is in the service's Environment settings; copy it privately. Open the service's `/clipper-studio.html` on the iPhone, leave the engine URL empty, paste the token into API-TOKEN, and run a small test video.
4. Download completed exports promptly. The Render service is public at its `onrender.com` URL, but every Studio API action requires the generated 256-bit token. Do not share the token or service secrets.

## Free-plan limits

- Render Free web services use 0.1 CPU and 512 MB RAM. This may be too slow for longer videos; the 100 MiB upload cap is intentional.
- The service sleeps after 15 minutes without inbound traffic. Its filesystem is ephemeral: uploads, SQLite state, jobs, and exports disappear when the service restarts or sleeps. Start and finish a job in one active session, then download its exports.
- Render includes 750 service hours per workspace each month. If included bandwidth is exceeded and no payment method is on file, Render suspends free services rather than charging a card. Keep the service within the published free limits.
- This is suitable only for short test clips; it is not persistent or production hosting. Face framing uses OpenCV Haar frontal-face detection and can miss profiles, occlusion, or small faces.

The Studio upload, audio/scenes analysis, optional face detection, and FFmpeg render flow still needs live validation after a service is deployed.
