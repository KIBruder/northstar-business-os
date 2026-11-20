# Northstar – universelle Produkt-KI und FLUX-Bildproduktion

## Architektur
- Northstar sendet bis zu drei hochgeladene Produktreferenzen an den geschützten Cloudflare Worker unter `/api/analyze-product`.
- `@cf/moondream/moondream3.1-9B-A2B` analysiert die tatsächlichen Bilder: Produktart, sichtbare Identitätsmerkmale, Komponenten und Unsicherheiten.
- `@cf/meta/llama-3.1-8b-instruct` erstellt daraus einen strukturierten, kategorieunabhängigen Drei-Slide-BOFU-Plan mit Hooks und passenden Bildszenen.
- Northstar speichert das KI-Ergebnis lokal am Produkt und verwendet es für Content-Brief, Video-Szenen und FLUX-Prompts.
- `@cf/black-forest-labs/flux-2-klein-4b` erzeugt die drei 8:9-Bilder und erhält bis zu drei Referenzansichten des Produkts.
- Produktdaten und generierte Bilder werden lokal in IndexedDB gespeichert. Es gibt keine automatische TikTok-Veröffentlichung.

## Cloudflare Worker einrichten
1. Cloudflare Dashboard öffnen: https://dash.cloudflare.com/
2. Worker aus dem Ordner `cloudflare-worker` dieses Repositories deployen.
3. Worker → Settings → Variables and Secrets: Secret `NORTHSTAR_ACCESS_TOKEN` setzen.
4. Variable `ALLOWED_ORIGIN` auf `https://kibruder.github.io` setzen.
5. AI Binding `AI` muss in `wrangler.toml` vorhanden und im Worker aktiv sein.
6. Worker-Adresse mit `.workers.dev` notieren.

## Northstar verbinden
1. Content-Projekt öffnen.
2. Worker-Adresse inklusive `/api/generate-image` hinterlegen.
3. Dasselbe `NORTHSTAR_ACCESS_TOKEN` in Northstar speichern.
4. Beim nächsten Produktimport analysiert die KI die Referenzbilder automatisch vor dem BOFU-Entwurf.
5. Für bestehende Produkte kann die KI beim Start der FLUX-Bildproduktion nachträglich analysieren.

## KI-Modelle und Kostenkontrolle
- Vision: `@cf/moondream/moondream3.1-9B-A2B`.
- Text/Creative-Strategie: `@cf/meta/llama-3.1-8b-instruct`.
- Bildproduktion: `@cf/black-forest-labs/flux-2-klein-4b`.
- Jede Produktanalyse verbraucht Workers-AI-Inferenzkontingent; drei Bildgenerierungen verbrauchen zusätzlich Bildmodellkontingent.
- Vor dem Rollout die aktuellen Cloudflare-Modellpreise und das verfügbare Konto-Kontingent prüfen. Bei Limitfehlern wird die Produktion abgebrochen und es erfolgt kein stilles kostenpflichtiges Upgrade.

## Referenzbilder und Grenzen
- Bis zu drei Originalbilder werden von der Vision-KI analysiert und an FLUX weitergereicht.
- Die KI leitet Produktkategorie und passende Bildmotive aus den tatsächlichen Referenzbildern ab; es gibt keine fest verdrahteten Sonderfälle für einzelne Produktarten.
- KI kann trotz Referenzen Produktdetails, Logos, Farben oder Beschriftungen verändern. Vor Veröffentlichung immer mit dem Original abgleichen.
- Preise und technische Aussagen werden nicht durch die Bild-KI verifiziert. Nur bestätigte Produktdaten dürfen als Fakten erscheinen.
- Die lokale Produktanalyse ersetzt keine unabhängige Quellen- oder Preisprüfung.

## Offizielle Dokumentation
- [Moondream 3.1 Vision-Modell](https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/)
- [FLUX.2 Klein 4B](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/)
- [Workers AI Modellkatalog](https://developers.cloudflare.com/workers-ai/models/)
- [Workers AI Preise](https://developers.cloudflare.com/workers-ai/platform/pricing/)
