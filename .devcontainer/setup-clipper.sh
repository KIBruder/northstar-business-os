#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y --no-install-recommends ffmpeg
python -m venv clipper-engine/.venv
clipper-engine/.venv/bin/python -m pip install --upgrade pip
clipper-engine/.venv/bin/pip install \
  -r clipper-engine/requirements.txt \
  -r clipper-engine/requirements-vision.txt
