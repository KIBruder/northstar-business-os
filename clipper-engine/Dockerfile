FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CLIPPER_HOST=0.0.0.0 \
    CLIPPER_DATA_DIR=/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-vision.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-vision.txt
COPY main.py pipeline.py ./

RUN useradd --system --uid 10001 --create-home clipper \
    && mkdir -p /data \
    && chown -R clipper:clipper /app /data
USER clipper

EXPOSE 8765
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1"]
