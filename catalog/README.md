# Katalog

Öffentliche Rezepte (Cooklang, `recipes/**/*.cook`) und der Zutatenkatalog (`ingredients/*.yaml`).
Alle Inhalte stehen unter [CC BY-SA 4.0](LICENSE).

## Artikel (`ingredients/`)

Eine Datei je Kategorie, der Dateiname ist die Kategorie-ID (siehe `src/core/catalog/categories.ts`).
Ein Eintrag je Zeile:

```yaml
- { id: aepfel, name: Äpfel, synonyms: [Apfel], diet: vegan }
```

| Feld       | Pflicht | Bedeutung                                                                           |
| ---------- | ------- | ----------------------------------------------------------------------------------- |
| `id`       | ja      | dauerhaft, klein mit Bindestrichen, Umlaute als `ae`/`oe`/`ue`/`ss`                 |
| `name`     | ja      | Anzeigename, so wie er auf einer Einkaufsliste steht                                |
| `synonyms` | nein    | weitere Schreibweisen; jeder Name darf im Katalog nur einmal vorkommen              |
| `diet`     | nein    | `vegan`, `vegetarisch`, `pescetarisch` oder `omnivor`; leer bei Nicht-Lebensmitteln |
| `units`    | nein    | typische Einheiten                                                                  |

Prüfen mit `pnpm catalog:validate`; `pnpm build` erzeugt daraus `public/catalog/ingredients.json`.

## Nährwerte (`nutrition/`)

Grundlage für die Nährwerte der Rezepte ([ADR 0004](../docs/adr/0004-naehrwertdaten.md)). **Eigene Lizenzen**, siehe [`nutrition/LICENSE`](nutrition/LICENSE):

| Datei                | Inhalt                                                                         | Lizenz       |
| -------------------- | ------------------------------------------------------------------------------ | ------------ |
| `bls-4.0-auszug.csv` | Auszug aus dem Bundeslebensmittelschlüssel 4.0 (Max Rubner-Institut), je 100 g | CC BY 4.0    |
| `zuordnung.yaml`     | Artikel-ID → BLS-Code                                                          | CC BY-SA 4.0 |
| `gewichte.yaml`      | Gramm je Stück, EL, TL, Bund, Dose …; Dichten                                  | CC BY-SA 4.0 |

Neuer Artikel mit Nährwerten: Zeile in `zuordnung.yaml` ergänzen (übliche Einkaufsform, roh bzw. ungegart), den Auszug mit `python3 -I tools/bls-extract.py <BLS_4_0_Daten_2025_DE.xlsx>` neu erzeugen (Download: [blsdb.de](https://blsdb.de/download)) und bei Bedarf Gewichte in `gewichte.yaml` eintragen. Die Gewichte sind eigene Richtwerte – nichts aus anderen Datenbanken übernehmen.

## Rezepte (`recipes/`)

Cooklang-Dateien, eine je Rezept, z. B. `recipes/backen/hefeteig.cook`. Schreibweise: [`docs/rezepte.md`](../docs/rezepte.md), Beitragsregeln: [`CONTRIBUTING.md`](../CONTRIBUTING.md#rezepte-und-zutaten). `pnpm catalog:validate` prüft sie mit demselben Parser wie die App.
