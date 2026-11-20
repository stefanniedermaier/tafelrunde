# Phase 1 – Geteilte Einkaufsliste

**Ziel:** Die Familie nutzt im Alltag eine gemeinsame Einkaufsliste mit Kategorien, die verschlüsselt synchronisiert wird. Damit ist die Sync-Architektur im echten Einsatz erprobt.

**Voraussetzung:** Phase 0 abgeschlossen, mit Go für Google Drive.

## Aufgaben

### 1.1 Domänenkern (`src/core`)
- [ ] Typen und Yjs-Schema für Bereich, Gerät, Register, Liste und Eintrag
- [ ] Interface `StorageProvider`: eigene Datei anlegen und aktualisieren, Lese-Freigabe setzen, fremde Datei lesen (Metadaten und Inhalt), Anmeldestatus
- [ ] Fake-Provider im Arbeitsspeicher für Tests

### 1.2 Krypto
- [ ] Schlüsselerzeugung, AES-256-GCM, AAD, `seq`, base64url
- [ ] Tests mit festen Testvektoren sowie für Manipulation und Rollback

### 1.3 Google-Drive-Provider
- [ ] Login per Weiterleitung laut [Architektur](01-architektur.md#login-per-weiterleitung), Scope `drive.file`: `state`-Prüfung, Token sofort aus der URL entfernen, stille Erneuerung mit `prompt=none`, sonst „Anmeldung nötig“; Token-Speicherung wie in ADR 0001
- [ ] Datei im Ordner `Tafelrunde/` anlegen, Freigabe setzen, aktualisieren
- [ ] Lesen per API-Key; Fehlerbehandlung für fehlende Dateien, erschöpfte Kontingente und offline, jeweils mit Backoff

### 1.4 Sync-Engine
- [ ] Lokale Persistenz mit y-indexeddb
- [ ] Schreiben: Entprellung, ein Vorgang gleichzeitig, `seq`, Warteschlange solange kein Token da ist
- [ ] Lesen: Intervalle je Ansicht, Page Visibility, sofortige Abfrage beim Zurückkehren
- [ ] Zusammenführen, Rollback-Schutz, nicht entschlüsselbare Dateien ignorieren
- [ ] Komponente für den Sync-Status

### 1.5 Einrichtung
- [ ] Erster Start: eigener Name und Gerätename
- [ ] „Mit Google verbinden“, nur fürs Schreiben nötig
- [ ] Der persönliche Bereich wird automatisch angelegt
- [ ] Haushalt anlegen

### 1.6 Einladen und Beitreten
- [ ] Einladung als QR-Code und Link, Schlüssel im URL-Fragment
- [ ] QR-Code mit der Kamera scannen (Android: BarcodeDetector); am Desktop den Link einfügen
- [ ] Antwort-Code zurück an das einladende Gerät
- [ ] Liste der Mitglieder und Geräte, Geräte umbenennen

### 1.7 Entfernen und Schlüsselwechsel
- [ ] Gerät entfernen, neuen Schlüssel erzeugen, verbleibende Geräte per QR aktualisieren

### 1.8 Wiederherstellung
- [ ] Wiederherstellungscode je Bereich anzeigen und drucken; beim Einrichten darauf hinweisen
- [ ] Bereich auf einem neuen Gerät aus dem Code wiederherstellen

### 1.9 Artikel-Grundkatalog
- [ ] `catalog/ingredients/` mit etwa 300 häufigen Artikeln samt Kategorie und Synonymen, auch Nicht-Lebensmittel wie Drogerieartikel
- [ ] Standard-Kategorien: Obst & Gemüse · Brot & Backwaren · Milch, Käse & Eier · Fleisch, Wurst & Fisch · Tiefkühl · Nudeln, Reis & Konserven · Backen · Gewürze, Öle & Saucen · Frühstück & Aufstriche · Süßes & Snacks · Getränke · Drogerie & Haushalt · Sonstiges
- [ ] Build-Skript erzeugt die Katalogdateien für die App (siehe [Katalog-Pipeline](01-architektur.md#katalog-pipeline))

### 1.10 Einkaufsliste
- [ ] Mehrere Listen pro Bereich
- [ ] Eintrag hinzufügen mit Vorschlägen aus Katalog und bisherigen Einträgen; Menge, Einheit und Notiz frei
- [ ] Gruppierung nach Kategorie; wird eine Kategorie geändert, merkt sich der Haushalt die Zuordnung
- [ ] Läden mit eigener Reihenfolge der Kategorien
- [ ] Abhaken: gedimmt, durchgestrichen, ans Ende der Gruppe; Rückgängig; „Erledigte entfernen“
- [ ] Doppelte Einträge erkennen und Zusammenführen anbieten
- [ ] Eingabe per Diktierfunktion der Tastatur funktioniert (keine eigene Spracherkennung)

### 1.11 Liste mit anderen teilen
- [ ] Eine einzelne Liste in einen eigenen Bereich überführen und Externe einladen
- [ ] Lesen ohne Google-Konto, Abhaken und Ändern mit Konto

### 1.12 Qualität
- [ ] Unit-Tests: Krypto, Zusammenführen, Kategorisierung
- [ ] Integrationstests: drei Geräte mit Fake-Provider, Offline-Szenarien, Rollback, untergeschobene Dateien
- [ ] E2E-Tests mit Playwright: zwei Browser-Kontexte, Einladen, gemeinsames Abhaken
- [ ] Familientest auf Android und Desktop, mindestens zwei Wochen
- [ ] `docs/threat-model.md` und den Datenschutzhinweis („welche Daten liegen wo“) aktualisieren

## Akzeptanzkriterien
- Bei offener App erscheinen Änderungen auf anderen Geräten nach höchstens 5 s (P90)
- Gleichzeitige Offline-Änderungen auf zwei Geräten werden ohne Verlust zusammengeführt
- Die Dateien in Google Drive sind ohne Schlüssel nicht lesbar (manuell geprüft)
- Ein neues Familienmitglied ist in unter 2 Minuten eingebunden
- Die Wiederherstellung per Code klappt auf einem frischen Gerät
- Die App ist vollständig offline nutzbar, der Sync-Status ist jederzeit erkennbar
- axe meldet keine kritischen Befunde

## Nicht Teil dieser Phase
Rezepte, Wochenplan, Import, automatischer Schlüsselwechsel.
