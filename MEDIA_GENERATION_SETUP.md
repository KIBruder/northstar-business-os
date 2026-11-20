# Northstar – echte KI-Bildproduktion

## Funktionsumfang
- Northstar sendet bis zu 8 gespeicherte Produktbilder als Referenzen an einen geschützten Cloudflare Worker.
- Der Worker ruft die OpenAI Images API mit `gpt-image-2.6-flare` auf.
- Northstar erzeugt drei einzelne Produktvisuals, schneidet sie auf exakt 8:9 zu und speichert die PNG-Dateien lokal am Content-Projekt in IndexedDB.
- Der API-Schlüssel liegt ausschließlich als Cloudflare-Secret auf dem Worker.

## Einrichtung
1. Dieses Verzeichnis als Cloudflare Worker deployen.
2. Unter Worker → Settings → Variables and Secrets folgende Secrets anlegen:
   - `OPENAI_API_KEY`: eigener OpenAI API-Key (separates API-Billing; ChatGPT-Abonnement enthält kein API-Guthaben).
   - `NORTHSTAR_ACCESS_TOKEN`: selbst gewähltes langes Zufallstoken.
3. `ALLOWED_ORIGIN` auf die tatsächliche GitHub-Pages-Origin setzen: `https://kibruder.github.io`.
4. Worker deployen. Die Worker-Adresse endet auf `.workers.dev`.
5. In Northstar beim Content-Projekt die Worker-Adresse mit `/api/generate-image` und dasselbe Zugriffstoken hinterlegen.

## Kostenkontrolle
- Jede Slide löst einen separaten kostenpflichtigen Images-API-Aufruf aus.
- Drei Slides bedeuten drei API-Aufrufe.
- Die Generierung startet ausschließlich nach Klick auf „3 Slides jetzt generieren“.
- Vor Live-Nutzung die aktuellen Preise im OpenAI Platform Billing prüfen.

## Grenzen
- Kein API-Key im Frontend, in localStorage oder in GitHub.
- Das Zugriffstoken schützt den Worker zusätzlich; es ersetzt nicht den API-Key-Schutz.
- Eingaben sind auf 8 Bilder und 14 MB Referenzdaten begrenzt.
- Generierte Bilder können Produktdetails verändern. Vor Veröffentlichung Produkt, Farbe, Logo, Preis und Eigenschaften mit den Originalbildern abgleichen.
- Northstar speichert die generierten Bilder lokal. Es gibt keine automatische TikTok-Veröffentlichung.
- API-Zugang, Modellverfügbarkeit und Kosten hängen vom OpenAI-API-Projekt ab. Eine Organisationsverifizierung kann erforderlich sein.
