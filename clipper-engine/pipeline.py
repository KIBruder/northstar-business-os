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



def _timeline_expression(samples: list[tuple[float, float]]) -> str:
    """Build a piecewise-linear FFmpeg expression from clip-relative samples."""
    if not samples:
        raise ValueError("At least one tracking sample is required")
    if len(samples) == 1:
        return f"{samples[0][1]:.2f}"
    expression = f"{samples[-1][1]:.2f}"
    for index in range(len(samples) - 2, -1, -1):
        t0, v0 = samples[index]
        t1, v1 = samples[index + 1]
        if t1 <= t0:
            continue
        interpolation = f"({v0:.2f}+({v1-v0:.2f})*(t-{t0:.3f})/{t1-t0:.3f})"
        expression = f"if(lt(t\\,{t1:.3f})\\,{interpolation}\\,{expression})"
    return expression


def face_tracking_crop(path: Path, start: float, end: float, aspect: str) -> tuple[int, int, str, str]:
    """Detect frontal faces at 1 Hz and return a smoothed, time-varying crop."""
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("Face-aware Reframing benötigt OpenCV. Installiere clipper-engine/requirements-vision.txt.") from exc

    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError("Video konnte für die Gesichtserkennung nicht geöffnet werden.")
    source_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if source_width < 2 or source_height < 2:
        capture.release()
        raise RuntimeError("Videoauflösung für Face-aware Reframing konnte nicht gelesen werden.")
    target_ratio = {"9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1.0}[aspect]
    if source_width / source_height > target_ratio:
        crop_height = source_height
        crop_width = max(2, min(source_width, int(round(source_height * target_ratio))))
    else:
        crop_width = source_width
        crop_height = max(2, min(source_height, int(round(source_width / target_ratio))))

    classifier_path = str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")
    classifier = cv2.CascadeClassifier(classifier_path)
    if classifier.empty():
        capture.release()
        raise RuntimeError("OpenCV-Gesichtsmodell konnte nicht geladen werden.")

    duration = max(1.0, end - start)
    samples: list[tuple[float, float, float]] = []
    previous = None
    try:
        for elapsed in range(0, int(math.ceil(duration)) + 1):
            if elapsed > duration:
                break
            capture.set(cv2.CAP_PROP_POS_MSEC, (start + elapsed) * 1000)
            ok, frame = capture.read()
            if not ok:
                continue
            height, width = frame.shape[:2]
            factor = min(1.0, 640 / max(width, height))
            resized = cv2.resize(frame, (max(1, int(width * factor)), max(1, int(height * factor)))) if factor < 1 else frame
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
            faces = classifier.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(24, 24))
            if len(faces):
                choices = []
                for x, y, w, h in faces:
                    center_x, center_y = (x + w / 2) / factor, (y + h / 2) / factor
                    continuity = 0 if previous is None else math.hypot(center_x - previous[0], center_y - previous[1]) / max(source_width, source_height)
                    choices.append((w * h / (1 + continuity * 8), center_x, center_y))
                _, center_x, center_y = max(choices)
                previous = (center_x, center_y)
                samples.append((float(elapsed), center_x, center_y))
            elif previous is not None:
                samples.append((float(elapsed), previous[0], previous[1]))
    finally:
        capture.release()

    if not samples:
        raise RuntimeError("Kein frontales Gesicht erkannt. Nutze 'Gesamtes Bild' oder 'Bildfüllend' als Alternative.")
    if samples[0][0] > 0:
        samples.insert(0, (0.0, samples[0][1], samples[0][2]))
    smoothed = []
    for index, (stamp, _x, _y) in enumerate(samples):
        neighbors = samples[max(0, index - 1):min(len(samples), index + 2)]
        smoothed.append((stamp, sum(item[1] for item in neighbors) / len(neighbors),
                         sum(item[2] for item in neighbors) / len(neighbors)))
    x_samples, y_samples = [], []
    for stamp, center_x, center_y in smoothed:
        x_samples.append((stamp, max(0.0, min(source_width - crop_width, center_x - crop_width / 2))))
        y_samples.append((stamp, max(0.0, min(source_height - crop_height, center_y - crop_height * 0.36))))
    return crop_width, crop_height, _timeline_expression(x_samples), _timeline_expression(y_samples)

def render(path: Path, output: Path, start: float, end: float, aspect: str, quality: int, framing: str = "crop") -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("FFmpeg ist nicht installiert.")
    dimensions = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}
    if aspect not in dimensions:
        raise RuntimeError("Ungültiges Seitenverhältnis.")
    if framing not in {"crop", "blur", "face"}:
        raise RuntimeError("Ungültige Bildanpassung.")
    width, height = dimensions[aspect]
    scale = min(quality / 1080, 1.0)
    width, height = int(width * scale), int(height * scale)
    width, height = width - width % 2, height - height % 2
    duration = max(1, end - start)
    command = [ffmpeg, "-y", "-ss", f"{start:.3f}", "-i", str(path), "-t", f"{duration:.3f}", "-map", "0:a?"]
    if framing == "crop":
        command += ["-map", "0:v:0", "-vf", f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1"]
    elif framing == "face":
        crop_width, crop_height, x_expr, y_expr = face_tracking_crop(path, start, end, aspect)
        vf = f"crop={crop_width}:{crop_height}:x='{x_expr}':y='{y_expr}',scale={width}:{height},setsar=1"
        command += ["-map", "0:v:0", "-vf", vf]
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
