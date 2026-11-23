# Mitmachen

Danke für dein Interesse! Beiträge sind willkommen – Code, Rezepte, Zutaten und Hinweise.

## Grundregeln

- Es gilt der [Verhaltenskodex](CODE_OF_CONDUCT.md).
- Mit einem Beitrag stellst du ihn unter die Lizenz des jeweiligen Bereichs: Code unter AGPL-3.0-or-later, Rezepte, Zutatenkatalog und Dokumentation unter CC BY-SA 4.0 (siehe `REUSE.toml`).
- Übernimm keine Rezepttexte oder Bilder, an denen du keine Rechte hast.

## Ablauf

1. Issue anlegen oder ein bestehendes aufgreifen.
2. Branch von `main`, kleine, fokussierte Änderungen.
3. Commits nach [Conventional Commits](https://www.conventionalcommits.org/de/) (`feat:`, `fix:`, `docs:`, `chore:` …). Der Titel des Pull Requests folgt derselben Konvention, weil per Squash gemergt wird.
4. Vor dem Pull Request lokal prüfen:
   ```sh
   pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
   ```
5. Alle CI-Checks müssen grün sein.

## Sicherheitsregeln im Code

- Kein `v-html`, kein `innerHTML`; Nutzerinhalte werden immer als Text gerendert.
- Keine Fremdskripte, Fremd-Fonts oder Tracker; die CSP (`build/csp.ts`) wird nicht gelockert.
- `src/core` importiert weder Vue noch `ui`, `providers` oder `app`.
- Neue Abhängigkeiten nur mit AGPL-kompatibler Lizenz (`pnpm licenses:check`) und mit Begründung im Pull Request.
- Änderungen am Sicherheitsmodell aktualisieren `docs/threat-model.md`.

## Rezepte und Zutaten

Der Katalog in `catalog/` nimmt ab Phase 2 Beiträge an. Format und Prüfregeln werden dann hier beschrieben.
