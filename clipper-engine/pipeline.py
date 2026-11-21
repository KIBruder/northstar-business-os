from __future__ import annotations

import array
from functools import lru_cache
import math
import os
import re
import shutil
import statistics
import subprocess
import sys
import uuid
import wave
from pathlib import Path
from typing import Any


def run(command: list[str], timeout: int = 3600) -> subprocess.CompletedProcess:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)


def audio_energy(path: Path, work: Path) -> tuple[list[float], float]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg fehlt. Installiere FFmpeg und füge ffmpeg zu PATH hinzu.")
    work.mkdir(parents=True, exist_ok=True)
    wav_path = work / "analysis-audio.wav"
    result = run([ffmpeg, "-y", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav_path)], timeout=7200)
    if result.returncode:
        raise RuntimeError("Audio konnte nicht dekodiert werden: " + result.stderr[-1200:])
    energies: list[float] = []
    with wave.open(str(wav_path), "rb") as wav:
        rate, width, frames = wav.getframerate(), wav.getsampwidth(), wav.getnframes()
        if width != 2:
            raise RuntimeError("Unerwartetes PCM-Audioformat.")
        while True:
            raw = wav.readframes(rate)
            if not raw:
                break
            count = len(raw) // 2
            if count:
                values = array.array("h")
                values.frombytes(raw)
                if sys.byteorder != "little":
                    values.byteswap()
                energies.append(math.sqrt(sum(float(v) * v for v in values) / count) / 32768.0)
    return energies, frames / rate if rate else 0.0


@lru_cache(maxsize=2)
def load_whisper_model(model_size: str):
    from faster_whisper import WhisperModel
    return WhisperModel(model_size, device="cpu", compute_type="int8")


def transcribe_audio(wav_path: Path) -> list[dict[str, Any]] | None:
    """Optional local ASR. None means faster-whisper is not installed."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None

    model_size = os.environ.get("CLIPPER_WHISPER_MODEL", "small")
    language = os.environ.get("CLIPPER_WHISPER_LANGUAGE", "").strip() or None
    model = load_whisper_model(model_size)
    segments, _info = model.transcribe(
        str(wav_path), language=language, vad_filter=True, beam_size=3,
        condition_on_previous_text=False,
    )
    transcript = []
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            transcript.append({
                "start": max(0.0, float(segment.start)),
                "end": max(float(segment.start), float(segment.end)),
                "text": text,
            })
    return transcript


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


def transcript_features(segments: list[dict[str, Any]], start: float, end: float) -> tuple[float, str, list[str]]:
    overlapping = [s for s in segments if s["end"] > start and s["start"] < end]
    text = " ".join(s["text"] for s in overlapping).strip()
    if not text:
        return 0.0, "", []
    words = re.findall(r"[\wÄÖÜäöüß'-]+", text.lower())
    if not words:
        return 0.0, text[:280], []
    duration = max(1.0, end - start)
    spoken_seconds = sum(max(0.0, min(end, s["end"]) - max(start, s["start"])) for s in overlapping)
    coverage = min(1.0, spoken_seconds / duration)
    word_density = min(1.0, len(words) / max(8.0, duration * 1.8))
    emphasis_terms = {
        "aber", "warum", "unglaublich", "plötzlich", "geheimnis", "fehler",
        "achtung", "wichtig", "krass", "niemals", "endlich", "deshalb",
        "however", "why", "insane", "secret", "mistake", "wait", "never",
        "finally", "because", "actually",
    }
    emphasis = min(1.0, sum(1 for word in words if word in emphasis_terms) / 2.0)
    punctuation = min(1.0, (text.count("?") + text.count("!") + text.count("…")) / 3.0)
    score = 0.35 * coverage + 0.35 * word_density + 0.20 * emphasis + 0.10 * punctuation
    reasons = []
    if coverage >= 0.35:
        reasons.append("zusammenhängende Sprachpassage erkannt")
    if emphasis > 0:
        reasons.append("markante Begriffe im Transkript")
    if punctuation > 0:
        reasons.append("Frage- oder Ausrufstruktur im Transkript")
    return min(1.0, score), text[:280], reasons


def analyze(path: Path, output_dir: Path, clip_seconds: int, clip_count: int, project_id: str) -> list[dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    wav_path = output_dir / "analysis-audio.wav"
    try:
        energies, duration = audio_energy(path, output_dir)
        if duration <= 0 or not energies:
            raise RuntimeError("Die Quelldatei enthält keine analysierbare Audiospur.")
        transcript = transcribe_audio(wav_path)
    finally:
        wav_path.unlink(missing_ok=True)

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
        reasons = []
        if avg > baseline * 1.25:
            reasons.append("überdurchschnittliche Audioaktivität")
        if variation > 0.025:
            reasons.append("deutliche Audiodynamik")
        if scene_count:
            reasons.append(f"{scene_count} erkannte Szenenwechsel")

        transcript_score = 0.0
        excerpt = ""
        if transcript is not None:
            transcript_score, excerpt, transcript_reasons = transcript_features(transcript, start, end)
            reasons.extend(transcript_reasons)
            score = 100 * (0.40 * audio_score + 0.20 * dynamics_score + 0.10 * scene_score + 0.30 * transcript_score)
        else:
            score = 100 * (0.55 * audio_score + 0.30 * dynamics_score + 0.15 * scene_score)
        if not reasons:
            reasons.append("stabile Audioaktivität")
        item = {
            "start_seconds": round(start, 2), "end_seconds": round(end, 2),
            "score": round(score, 1), "reasons": reasons,
        }
        if transcript is not None:
            item["transcript_score"] = round(transcript_score * 100, 1)
            item["transcript_excerpt"] = excerpt
        candidates.append(item)

    candidates.sort(key=lambda item: item["score"], reverse=True)
    selected = []
    for item in candidates:
        if all(abs(item["start_seconds"] - prev["start_seconds"]) >= window * 0.65 for prev in selected):
            selected.append(item)
        if clip_count > 0 and len(selected) >= clip_count:
            break
    selected.sort(key=lambda item: item["start_seconds"])
    for item in selected:
        item["id"] = str(uuid.uuid4())
    return selected


def render(path: Path, output: Path, start: float, end: float, aspect: str, quality: int, framing: str = "crop") -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg ist nicht installiert.")
    dimensions = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
    if aspect not in dimensions:
        raise RuntimeError("Ungültiges Seitenverhältnis.")
    if framing not in {"crop", "blur"}:
        raise RuntimeError("Ungültige Bildanpassung.")
    width, height = dimensions[aspect]
    scale = min(quality / 1080, 1.0)
    width, height = int(width * scale), int(height * scale)
    width, height = width - width % 2, height - height % 2
    duration = max(1, end - start)
    command = [ffmpeg, "-y", "-ss", f"{start:.3f}", "-i", str(path), "-t", f"{duration:.3f}", "-map", "0:a?"]
    if framing == "crop":
        command += ["-map", "0:v:0", "-vf", f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1"]
    else:
        graph = (f"[0:v]split=2[bg][fg];[bg]scale={width}:{height}:force_original_aspect_ratio=increase,"
                 f"crop={width}:{height},boxblur=20:2[background];"
                 f"[fg]scale={width}:{height}:force_original_aspect_ratio=decrease[foreground];"
                 f"[background][foreground]overlay=(W-w)/2:(H-h)/2,setsar=1[outv]")
        command += ["-map", "[outv]", "-filter_complex", graph]
    command += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(output)]
    result = run(command, timeout=7200)
    if result.returncode or not output.exists() or output.stat().st_size == 0:
        output.unlink(missing_ok=True)
        raise RuntimeError("FFmpeg-Export fehlgeschlagen: " + result.stderr[-1200:])
    return {"path": str(output), "size_bytes": output.stat().st_size, "duration_seconds": round(duration, 2), "aspect_ratio": aspect, "resolution": f"{width}x{height}", "framing": framing}
