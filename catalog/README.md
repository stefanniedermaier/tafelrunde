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

Rezept-Beiträge werden ab Phase 2 angenommen.
