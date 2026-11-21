# CLIP-FINDER PRO — verbindliche Produktarchitektur

**Status:** beschlossen; Umsetzung startet auf Feature-Branch.  
**Produkt:** vollständiger Umbau von Northstar zum Local-first AI Video Studio.  
**Priorisierte Modi:** Auto Clipper zuerst vollständig; danach Podcast Repurpose und Movie Recap (verbindliche Ziellänge 5–15 Minuten).  
**Voiceover:** ausschließlich KI-Stimmen in der ersten Ausbaustufe.  
**Kostenrahmen:** 0 € Software-/API-Budget zum Start; lokale Open-Source-Komponenten bevorzugt.

## 1. Produktprinzipien
- Eine gemeinsame Medien- und Analysepipeline, mehrere Produktionsmodi.
- Lokale Verarbeitung ist Standard; ein selbst gehosteter Worker ist optional.
- iPhone/PWA ist Bedienoberfläche. Lange Videos werden von einem lokalen Rechner/Server verarbeitet, nicht in einem mobilen Safari-Tab.
- Originalmedien bleiben unverändert. Abgeleitete Dateien und Projekte werden getrennt gespeichert.
- Keine Funktion wird als KI-gestützt bezeichnet, solange sie nicht tatsächlich ein Modell aufruft und das Ergebnis validiert.
- Langläufe müssen persistent, fortsetzbar und nach Neustart wiederherstellbar sein.
- Keine Cloud- oder kostenpflichtigen APIs als Pflichtabhängigkeit.

## 2. Produktionsmodi
### A. Auto Clipper (P0)
Input: lange Videos/Streams, einzeln oder als Projekt mit mehreren Dateien.  
Konfiguration: Ziellänge (15–180+ Sekunden), Anzahl oder alle geeigneten Highlights, Seitenverhältnis (9:16, 16:9, 1:1), Modus (Auto, Sprache, Action, Mix).  
Output: eigenständige MP4-Clips, Vorschauen, Zeitmarken und nachvollziehbare Clip-Scores. Originalton bleibt standardmäßig erhalten.

### B. Movie Recap (P1)
Ziellänge frei einstellbar, verbindlich 5–15 Minuten. Pipeline: Medien-/Szenenindex → Transkript/OCR-Metadaten soweit verfügbar → hierarchische Szenenzusammenfassungen → chronologische Storyline → Recap-Skript → lokales KI-TTS → Auswahl zulässiger Szenen → Schnitt/Mix → Untertitel/Qualitätskontrolle.  
Die Zusammenfassung muss Handlung und Chronologie erhalten; der Nutzer kann Skript und Szenenauswahl vor dem Rendern prüfen. Keine Behauptung, dass ein vollständiger Film in einem einzigen Kontextfenster verstanden wird.

### C. Podcast Repurpose (P1)
Transkript mit Zeitmarken und Sprechersegmenten → Themen-/Highlight-Erkennung → Clip-Kandidaten → Hook/Untertitel → optional vertikaler Crop → MP4-Export. Originalton bleibt verfügbar. Sprechertrennung ist optional und nur aktiv, wenn lokal verfügbare Modelle zuverlässig installiert sind.

## 3. Gemeinsame Architektur
- **PWA/UI:** bestehende statische PWA wird schrittweise durch CLIP-FINDER PRO ersetzt.
- **Local Engine:** Python + FastAPI als lokaler Job-/Medienserver.
- **Media:** FFmpeg/ffprobe für Probe, Schnitt, Skalierung, Audio-Mix und Export.
- **Speech:** faster-whisper für lokale Transkription.
- **Scenes/vision:** PySceneDetect und OpenCV für Szenen-/Bildsignale; semantische Bildmodelle erst nach Benchmark.
- **LLM:** zunächst austauschbarer lokaler Adapter; keine kostenpflichtige API.
- **TTS:** lokales Open-Source-TTS mit dokumentierter Modell-/Stimmenlizenz; Stimme und Sprache wählbar.
- **Persistence:** SQLite für Projekte, Assets, Jobs, Kandidaten, Skripte und Exporte; Dateisystem für Medien.
- **Optional Remote Worker:** dieselbe Engine in Docker auf eigenem Server, mit Job-Queue und authentifiziertem Upload/Download.

## 4. Datenmodell (logische Entitäten)
- Project: id, title, mode, created_at, updated_at, settings_json.
- Asset: id, project_id, source_name, path, size_bytes, sha256, duration, video/audio streams, probe_json.
- Job: id, project_id, type, status, progress, stage, error_code, created_at, updated_at.
- TranscriptSegment: asset_id, start, end, text, speaker_id?.
- Scene: asset_id, start, end, thumbnail_path, signals_json.
- ClipCandidate: project_id, source_asset_id, start, end, score, reasons_json, fingerprint.
- Script: project_id, language, target_duration, body, version.
- Export: project_id, candidate_id?, path, duration, codec, created_at.

## 5. Verarbeitungsregeln
- Lange Medien in Zeitfenster/Jobs zerlegen; nie einen 5–6-Stunden-Stream in einem einzelnen KI-Prompt verarbeiten.
- Analyse und Rendering getrennte Jobs; Zwischenstände persistieren.
- Clip-Auswahl kombiniert Sprache, Szenenwechsel, Audioereignisse und Kontext; Lautstärke allein ist kein Qualitätskriterium.
- Fingerprints: SHA-256 der Quelldatei plus Clip-Zeitfenster/Perceptual-Hash für Duplikatvermeidung.
- Export-Validierung: Datei existiert, ffprobe kann sie lesen, erwartete Dauer/Seitenverhältnis, Audio vorhanden und A/V-Synchronität stichprobenartig geprüft.
- Fehler müssen konkrete Stufe und verständliche Ursache ausgeben.

## 6. Sicherheit, Datenschutz und Rechte
- Lokale Verarbeitung standardmäßig; keine stillen Uploads an Dritte.
- Lokaler API-Server bindet standardmäßig nur an 127.0.0.1. LAN-Fernbedienung erfordert bewusstes Aktivieren und ein API-Token.
- Dateinamen werden serverseitig bereinigt; Uploadgrößen und Speicherplatz werden kontrolliert.
- Filme/Sendungen nur mit Nutzungsrechten oder einer tragfähigen gesetzlichen Grundlage verarbeiten/veröffentlichen. Ein Recap-Voiceover macht fremdes Bildmaterial nicht automatisch frei nutzbar.
- TTS-Stimmen und Modelle nur mit geprüfter kommerzieller/privater Lizenz einsetzen.

## 7. Meilensteine und Abnahmekriterien
### P0 — Clipper-Kern
1. Medienimport und ffprobe-Metadaten.
2. Persistente Projekte/Jobs und Upload-Wiederaufnahme.
3. Kandidatenerkennung (Audio-/Szenen-/Transkript-Signale).
4. Variable Clip-Längen, Batch-Rendering mit FFmpeg.
5. Originalton, Seitenverhältnisse und Exportprüfung.
6. Duplikaterkennung über Wiederholungsläufe.
**Abnahme:** ein 5–6-Stunden-Testvideo kann importiert, analysiert und in konfigurierbare, abspielbare MP4-Clips exportiert werden; Jobs überstehen einen Neustart.

### P1 — Podcast Repurpose
Transkription, Themen-/Sprechersegmente, Highlight-Ranking, Hook-/Caption-Entwürfe, Clip-Export.

### P1 — Movie Recap
Hierarchische Story-Analyse, editierbares Skript, lokale KI-TTS, Szenenauswahl, 5–15-Minuten-Render und Qualitätsprüfung.

### P2 — Bedienung/Server
Mobile PWA, LAN-Token, optionaler Docker-Remote-Worker, Job-Synchronisierung.

## 8. Explizit nicht im ersten Release
- Kostenpflichtige Cloud-KI oder Cloud-Rendering als Voraussetzung.
- Vollständige Videobearbeitung/Timeline wie Premiere.
- Automatisches Veröffentlichen auf TikTok/YouTube.
- Voice cloning oder Nachahmung realer Stimmen ohne ausdrückliche Rechte/Einwilligung.
- Versprechen einer festen Verarbeitungszeit unabhängig von Hardware/Material.
