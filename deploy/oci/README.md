# CLIP-FINDER PRO on a free OCI server

This plan uses Oracle Cloud Infrastructure's Always Free Ampere A1 allowance (2 OCPU, 12 GB RAM) and private Tailscale Serve HTTPS. The MSI can stay off during normal use. The iPhone uses the existing Studio PWA; the OCI VM runs FFmpeg, OpenCV, SQLite, and the persistent job worker.

## Cost boundaries

- Create resources only if OCI labels them **Always Free Eligible** in the account's home region.
- Use `VM.Standard.A1.Flex`, at most 2 OCPU and 12 GB RAM total.
- Keep total boot and data volumes within the 200 GB Always Free block volume allowance.
- Do not upgrade the account to Pay As You Go. Capacity is not guaranteed and Oracle may reclaim idle instances.
- OCI account verification requires payment-card details and may create a temporary authorization hold. Stop if that is unacceptable.

## Account and server setup

1. The account owner signs in to their own OCI Free Tier account and accepts Oracle's terms themselves. Do not share credentials or payment-card information.
2. In the tenancy home region, create one Ubuntu ARM VM with `VM.Standard.A1.Flex`, 2 OCPU, 12 GB RAM, and a 50 GB boot volume. Confirm **Always Free Eligible** before creation. Do not select paid resources or upgrade the account.
3. Sign the VM and iPhone into the account owner's Tailscale network. Keep public ingress closed except SSH restricted to the owner's current IP during bootstrap. Tailscale Serve provides private HTTPS; do not open port 8765 or expose a public API.
4. Copy `clipper-engine` to the VM. Install Docker Engine from Docker's official Ubuntu repository. From the `clipper-engine` directory run:

```sh
sudo install -d -m 0750 /var/lib/clip-finder/data /etc/clip-finder
sudo chown 10001:10001 /var/lib/clip-finder/data
openssl rand -hex 32 | sudo tee /etc/clip-finder/api-token >/dev/null
sudo chmod 0600 /etc/clip-finder/api-token
sudo docker build -t clip-finder-engine:latest .
sudo docker run -d --name clip-finder-engine --restart unless-stopped \
  --publish 127.0.0.1:8765:8765 \
  --volume /var/lib/clip-finder/data:/data \
  --env CLIPPER_API_TOKEN="$(sudo cat /etc/clip-finder/api-token)" \
  --env CLIPPER_ALLOWED_ORIGINS=https://kibruder.github.io \
  --env CLIPPER_MAX_UPLOAD_BYTES=107374182400 \
  clip-finder-engine:latest
```

After the VM joins the owner's Tailscale network, enable private HTTPS forwarding:

```sh
sudo tailscale serve --bg http://127.0.0.1:8765
tailscale serve status
```

In the iPhone PWA, enter the private `https://<machine>.<tailnet>.ts.net` URL and the contents of `/etc/clip-finder/api-token`, then check the connection. Keep the token private. Rotate it by recreating the container with a new token if exposed.

## Data and limitations

Media, SQLite state, and exports persist under `/var/lib/clip-finder/data`; back up that directory to storage you control. The iPhone must be signed into the same tailnet. OCI can reclaim idle free instances and free capacity can be unavailable. Face framing uses OpenCV Haar frontal-face detection; it can fail on profiles, occlusion, or small faces. Whisper is omitted initially to avoid large model downloads and memory use.

To stop processing without deleting data: `sudo docker stop clip-finder-engine`. Before removing the VM, back up the data directory; deleting the VM can permanently destroy its boot volume.
