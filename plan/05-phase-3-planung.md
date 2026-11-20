# Phase 3 – Planung und Einkaufsliste aus Rezepten

**Ziel:** Der Kreislauf Planen → Einkaufen → Kochen ist geschlossen.

## Aufgaben

### 3.1 Datenmodell
- [ ] Planeinträge im Dokument `live`: Datum, Mahlzeit, Rezept-Referenz, Portionen, Notiz, Status (geplant oder gekocht)
- [ ] Ideen-Pool für Einträge ohne Datum

### 3.2 Wochenansicht
- [ ] Tage als Karten; die Mahlzeiten legt jeder Haushalt selbst fest (z. B. nur Abendessen)
- [ ] Verschieben per Drag & Drop am Desktop, mobil per Dialog
- [ ] Badge „Heute kochen“ mit Sprung in den Kochmodus

### 3.3 Zur Einkaufsliste
- [ ] Aus einem Rezept (mit gewählter Portionenzahl) und aus einem Zeitraum im Plan
- [ ] Vorschau vor dem Übernehmen: Einträge abwählen, Mengen anpassen

### 3.4 Zusammenführen
- [ ] Gleiche Zutaten über die Katalog-ID erkennen
- [ ] Einheiten vereinheitlichen: Masse (g, kg), Volumen (ml, l), Stück. EL, TL und Prise bleiben getrennt, solange keine Umrechnung bekannt ist.
- [ ] Herkunft je Eintrag sichtbar, z. B. „für: Pizza, Zwiebelkuchen“

### 3.5 Unterrezepte
- [ ] Standard: in Einzelzutaten auflösen
- [ ] Rückfrage „Hefeteig schon vorhanden?“: dann weglassen oder als einen Posten übernehmen

### 3.6 Grundvorräte
- [ ] Eine Haushaltsliste „immer im Haus“ (z. B. Salz, Pfeffer, Öl); diese Zutaten werden beim Übernehmen ausgeblendet oder abgefragt

### 3.7 Änderungen nachziehen
- [ ] Wird ein Rezept aus dem Plan entfernt oder ändert sich die Portionenzahl, werden die zugehörigen, noch nicht abgehakten Einträge angepasst (mit Rückfrage)

### 3.8 Nach dem Kochen
- [ ] „Gekocht“ markieren: Eintrag im Koch-Protokoll, „zuletzt gekocht“ aktualisiert, optional Bewertung

### 3.9 Qualität
- [ ] Unit-Tests: Einheiten, Zusammenführung, Auflösung von Unterrezepten
- [ ] E2E-Tests: Woche planen, Liste erzeugen, einkaufen, kochen

## Akzeptanzkriterien
- Eine Woche mit fünf Rezepten ergibt eine Liste mit zusammengeführten Mengen, richtigen Kategorien und sichtbarer Herkunft
- Wird ein Rezept aus dem Plan entfernt, passen sich die offenen Einträge an
- Grundvorräte landen nicht ungefragt auf der Liste
