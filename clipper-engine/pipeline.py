from __future__ import annotations

import json
import math
import re
import shutil
import statistics
import subprocess
import wave
from pathlib import Path
from typing import Any


def run(command: list[str], timeout: int = 3600) -> subprocess.CompletedProcess:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)


def audio_energy(path: Path, work: Path) -> tuple[list[float], float]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg fehlt. Installiere FFmpeg und füge ffmpeg zu PATH hinzu.")
    wav_path = work / "analysis-audio.wav"
    result = run([ffmpeg, "-y", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav_path)], timeout=7200)
    if result.returncode:
        raise RuntimeError("Audio konnte nicht dekodiert werden: " + result.stderr[-1200:])
    energies: list[float] = []
    with wave.open(str(wav_path), "rb") as wav:
        rate, width, frames = wav.getframerate(), wav.getsampwidth(), wav.getnframes()
        if width != 2:
            raise RuntimeError("Unerwartetes PCM-Audioformat.")
        samples_per_window = rate
        while True:
            raw = wav.readframes(samples_per_window)
            if not raw:
                break
            count = len(raw) // 2
            if not count:
                continue
            import array
            values = array.array("h")
            values.frombytes(raw)
            if __import__("sys").byteorder != "little":
                values.byteswap()
            rms = math.sqrt(sum(float(v) * v for v in values) / count)
            energies.append(rms / 32768.0)
    return energies, frames / rate if rate else 0.0


def scene_times(path: Path) -> list[float]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return []
    command = [ffmpeg, "-hide_banner", "-i", str(path), "-vf", "select='gt(scene,0.32)',showinfo", "-an", "-f", "null", "-"]
    try:
        result = run(command, timeout=7200)
    except subprocess.TimeoutExpired:
        return []
    return [float(v) for v in re.findall(r"pts_time:([0-9]+(?:\.[0-9]+)?)", result.stderr)]


def analyze(path: Path, output_dir: Path, clip_seconds: int, clip_count: int, project_id: str) -> list[dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    energies, duration = audio_energy(path, output_dir)
    if duration <= 0 or not energies:
        raise RuntimeError("Die Quelldatei enthält keine analysierbare Audiospur.")
    scenes = scene_times(path)
    window = max(10, min(clip_seconds, int(duration)))
    if duration <= window:
        starts = [0]
    else:
        stride = max(5, min(15, window // 3))
        starts = list(range(0, max(1, int(duration - window) + 1), stride))
        last = max(0, int(duration - window))
        if not starts or starts[-1] != last:
            starts.append(last)
    nonzero = [x for x in energies if x > 0.002]
    baseline = statistics.median(nonzero) if nonzero else 0.01
    candidates = []
    for start in starts:
        end = min(duration, start + window)
        a, b = max(0, int(start)), min(len(energies), int(math.ceil(end)))
        segment = energies[a:b]
        if not segment:
            continue
        avg = statistics.mean(segment)
        peak = max(segment)
        variation = statistics.pstdev(segment) if len(segment) > 1 else 0
        scene_count = sum(1 for t in scenes if start <= t <= end)
        audio_score = min(1.0, (avg / max(baseline, 0.004)) / 2.5)
        dynamics_score = min(1.0, variation * 5 + max(0, peak - avg) * 2)
        scene_score = min(1.0, scene_count / max(2, window / 20))
        score = round(100 * (0.55 * audio_score + 0.30 * dynamics_score + 0.15 * scene_score), 1)
        reasons = []
        if avg > baseline * 1.25: reasons.append("überdurchschnittliche Audioaktivität")
        if variation > 0.025: reasons.append("deutliche Audiodynamik")
        if scene_count: reasons.append(f"{scene_count} erkannte Szenenwechsel")
        if not reasons: reasons.append("stabile Audioaktivität")
        candidates.append({"start_seconds": round(start, 2), "end_seconds": round(end, 2), "score": score, "reasons": reasons})
    candidates.sort(key=lambda item: item["score"], reverse=True)
    selected = []
    for item in candidates:
        if all(abs(item["start_seconds"] - prev["start_seconds"]) >= window * 0.65 for prev in selected):
            selected.append(item)
        if clip_count > 0 and len(selected) >= clip_count:
            break
    selected.sort(key=lambda item: item["start_seconds"])
    for index, item in enumerate(selected, 1):
        item["id"] = f"{project_id}-{index}"
    return selected


def render(path: Path, output: Path, start: float, end: float, aspect: str, quality: int) -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg ist nicht installiert.")
    dimensions = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
    if aspect not in dimensions:
        raise RuntimeError("Ungültiges Seitenverhältnis.")
    width, height = dimensions[aspect]
    scale = min(quality / 1080, 1.0)
    width, height = int(width * scale), int(height * scale)
    width, height = width - width % 2, height - height % 2
    duration = max(1, end - start)
    vf = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1"
    command = [ffmpeg, "-y", "-ss", f"{start:.3f}", "-i", str(path), "-t", f"{duration:.3f}", "-map", "0:v:0", "-map", "0:a?", "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(output)]
    result = run(command, timeout=7200)
    if result.returncode or not output.exists() or output.stat().st_size == 0:
        output.unlink(missing_ok=True)
        raise RuntimeError("FFmpeg-Export fehlgeschlagen: " + result.stderr[-1200:])
    return {"path": str(output), "size_bytes": output.stat().st_size, "duration_seconds": round(duration, 2), "aspect_ratio": aspect, "resolution": f"{width}x{height}"}
