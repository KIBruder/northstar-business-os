FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CLIPPER_HOST=0.0.0.0 \
    CLIPPER_DATA_DIR=/tmp/clipper-data \
    CLIPPER_STUDIO_DIR=/studio \
    CLIPPER_SERVE_STUDIO=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY clipper-engine/requirements.txt clipper-engine/requirements-vision.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-vision.txt
COPY clipper-engine/main.py clipper-engine/pipeline.py ./
COPY clipper-studio.html clipper-studio.css clipper-studio.js /studio/
RUN useradd --system --uid 10001 --create-home clipper \
    && mkdir -p /tmp/clipper-data /studio \
    && chown -R clipper:clipper /app /studio /tmp/clipper-data
USER clipper
EXPOSE 10000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port \\"\${PORT:-10000}\\" --workers 1"]
