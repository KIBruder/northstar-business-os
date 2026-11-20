# Northstar – kostenlose KI-Bildproduktion mit Cloudflare Workers AI

## Architektur
- Northstar sendet pro Slide einen Prompt und optional ein Produktreferenzbild an einen geschützten Cloudflare Worker.
- Der Worker nutzt das Cloudflare Workers AI Binding und `@cf/black-forest-labs/flux-2-klein-4b`.
- Das Modell liefert Base64-Bilddaten zurück. Northstar verarbeitet und speichert die Slides lokal in IndexedDB.
- Kein OpenAI-API-Key und kein kostenpflichtiger OpenAI-Images-Aufruf.

## Cloudflare Free einrichten
1. Kostenloses Cloudflare-Konto öffnen: https://dash.cloudflare.com/
2. Workers & Pages öffnen und den Ordner `cloudflare-worker` aus diesem Repository mit Wrangler deployen.
3. Worker → Settings → Variables and Secrets: Secret `NORTHSTAR_ACCESS_TOKEN` mit langem Zufallswert anlegen.
4. Variable `ALLOWED_ORIGIN` auf `https://kibruder.github.io` setzen.
5. Prüfen, dass Workers Free aktiv bleibt. Keinen Paid-Plan aktivieren und keine Zahlungsdaten hinzufügen.
6. Die Worker-Adresse mit `.workers.dev` notieren.

## Northstar verbinden
1. Content-Projekt öffnen.
2. Worker-Adresse inklusive `/api/generate-image` eintragen.
3. Dasselbe `NORTHSTAR_ACCESS_TOKEN` in Northstar hinterlegen.
4. Zunächst nur einen Slide testweise generieren.

## Kontingent und Kostenbremse
- Cloudflare dokumentiert 10.000 Neurons pro Tag kostenlos für Workers AI; das Kontingent wird um 00:00 UTC zurückgesetzt.
- Auf Workers Free schlagen weitere Anfragen nach Erreichen des Tageslimits fehl. Für Mehrverbrauch ist ein Upgrade auf Workers Paid erforderlich; ohne Upgrade keine kostenpflichtige Fortsetzung.
- Das Kontingent gilt kontoübergreifend für Workers AI und kann durch andere Projekte verbraucht werden.
- Kosten/Neurons hängen vom Modell und der Bildgröße ab. Drei Slides verbrauchen entsprechend mehr Kontingent als ein einzelner Test.

## Referenzbilder und Grenzen
- Diese Integration übergibt maximal ein Referenzbild pro Slide.
- Das Modell unterstützt Bildgenerierung und Bildbearbeitung; Produkttreue muss praktisch geprüft werden.
- KI kann Produktdetails, Logos, Farben und Beschriftungen verändern. Vor Veröffentlichung immer mit dem Original abgleichen.
- Northstar speichert lokal und veröffentlicht nicht automatisch auf TikTok.

## Offizielle Dokumentation
- Modell und Eingabeformat: https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/
- Einführung und Multipart-Beispiel: https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/
- Kontingent: https://developers.cloudflare.com/workers-ai/platform/pricing/