# Northstar – Business OS (Grundsystem)

Dies ist die erste technische Basis der geplanten lokalen Business-PWA.

## Enthalten
- Installierbare PWA-Grundstruktur (Manifest + Service Worker)
- Responsive Oberfläche für Desktop und iPhone
- Arbeitsbereiche mit getrennter Produkt- und Content-Datenhaltung
- Lokale Speicherung über IndexedDB
- Produkt- und Content-Erfassung als funktionsfähige erste Datenflüsse
- Navigationsgerüst für die vereinbarten Geschäfts- und KI-Module
- Offline-Shell-Caching nach dem ersten erfolgreichen Laden

## Lokal starten
Ein Service Worker und die PWA-Installation benötigen einen sicheren Kontext (HTTPS oder localhost).

Mit Python:
```bash
python -m http.server 8000
```
Dann im Browser `http://localhost:8000` öffnen.

Alternativ kann ein beliebiger statischer HTTPS-Host verwendet werden. Es ist kein Backend und keine kostenpflichtige API erforderlich.

## Wichtige Grenzen dieser ersten Ausbaustufe
- Die Module Produktion, KI-Agenten, Analysen, Finanzen usw. sind derzeit UI-Grundgerüste, keine fertigen Fachsysteme.
- Es gibt noch keine KI-Modell-Anbindung, Affiliate-API, automatische Preisprüfung, Bild-/Videogenerierung oder automatische Veröffentlichung.
- Der Google-Fonts-Aufruf ist optional; für vollständig offline/lokal betriebene Nutzung kann die `@import`-Zeile in `src/styles.css` entfernt werden. Danach werden Systemschriften verwendet.
- Browserdaten liegen zunächst lokal auf dem jeweiligen Gerät. Zwischen iPhone und PC findet keine Synchronisierung statt.
- Der aktuelle lokale Speicher ist noch nicht verschlüsselt. Vor produktiver Nutzung werden Verschlüsselung, Backup/Restore, Datenexport und Berechtigungsschutz implementiert.

## Nächste Entwicklungsstufen
1. Datenmodell, Import/Export, Backup/Restore und Workspace-Isolation härten.
2. Produktrecherche mit nachvollziehbaren Quellen und Preis-Zeitstempeln.
3. Content- und Carousel-Editor mit Versionierung und Freigabegates.
4. Medienpipeline und Qualitätsprüfung.
5. Analytics- und Finanzdatenimport inkl. KI-Fonds-Ledger.
6. Agenten-Orchestrierung erst nach Sicherheits- und Kostenkontrolle.
