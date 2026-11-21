import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pipeline


def test_analysis_ranks_non_overlapping_signal_windows(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "audio_energy", lambda path, work: ([0.01] * 300, 300.0))
    monkeypatch.setattr(pipeline, "transcribe_audio", lambda path: None)
    monkeypatch.setattr(pipeline, "scene_times", lambda path: [20.0, 55.0, 90.0, 125.0, 160.0, 195.0, 230.0, 265.0])
    result = pipeline.analyze(Path("source.mp4"), tmp_path, 30, 3, "project")
    assert len(result) == 3
    assert all(item["end_seconds"] > item["start_seconds"] for item in result)
    assert len({item["id"] for item in result}) == 3
    assert all(0 <= item["score"] <= 100 for item in result)
    assert all("reasons" in item for item in result)


def test_transcript_features_rewards_speech_and_hooks():
    plain, _, _ = pipeline.transcript_features(
        [{"start": 0, "end": 8, "text": "This is a short explanation with several ordinary words"}],
        0, 30,
    )
    hook, excerpt, reasons = pipeline.transcript_features(
        [{"start": 0, "end": 20, "text": "Warum ist dieser Fehler so unglaublich? Achtung!"}],
        0, 30,
    )
    assert hook > plain
    assert "Warum" in excerpt
    assert reasons


def test_analysis_includes_transcript_scores_when_asr_available(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "audio_energy", lambda path, work: ([0.01] * 120, 120.0))
    monkeypatch.setattr(pipeline, "transcribe_audio", lambda path: [
        {"start": 2.0, "end": 24.0, "text": "Warum ist das so unglaublich? Achtung!"}
    ])
    monkeypatch.setattr(pipeline, "scene_times", lambda path: [])
    result = pipeline.analyze(Path("source.mp4"), tmp_path, 30, 2, "project")
    assert result
    assert all("transcript_score" in item for item in result)
    assert any("transcript_excerpt" in item for item in result)


def test_render_keeps_optional_source_audio_and_writes_mp4(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline.shutil, "which", lambda name: "/usr/bin/ffmpeg")
    def fake_run(command, timeout=3600):
        Path(command[-1]).write_bytes(b"mock-mp4")
        return subprocess.CompletedProcess(command, 0, "", "")
    monkeypatch.setattr(pipeline, "run", fake_run)
    output = tmp_path / "clip.mp4"
    result = pipeline.render(Path("source.mp4"), output, 12.0, 42.0, "9:16", 1080)
    assert output.read_bytes() == b"mock-mp4"
    assert result["duration_seconds"] == 30.0
    assert result["resolution"] == "1080x1920"
    assert result["aspect_ratio"] == "9:16"


def test_render_blur_framing_preserves_full_frame(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline.shutil, "which", lambda name: "/usr/bin/ffmpeg")
    captured = {}
    def fake_run(command, timeout=3600):
        captured["command"] = command
        Path(command[-1]).write_bytes(b"mock-mp4")
        return subprocess.CompletedProcess(command, 0, "", "")
    monkeypatch.setattr(pipeline, "run", fake_run)
    output = tmp_path / "blur.mp4"
    result = pipeline.render(Path("source.mp4"), output, 0, 20, "9:16", 720, "blur")
    command = captured["command"]
    graph = command[command.index("-filter_complex") + 1]
    assert "force_original_aspect_ratio=decrease" in graph
    assert "boxblur=20:2" in graph
    assert result["framing"] == "blur"
    assert result["resolution"] == "720x1280"


def test_render_rejects_unknown_framing(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline.shutil, "which", lambda name: "/usr/bin/ffmpeg")
    try:
        pipeline.render(Path("source.mp4"), tmp_path / "bad.mp4", 0, 10, "9:16", 1080, "tracking")
    except RuntimeError as exc:
        assert "Bildanpassung" in str(exc)
    else:
        raise AssertionError("unknown framing must be rejected")
