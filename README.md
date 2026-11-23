# Tafelrunde

Rezepte, Wochenplanung und geteilte Einkaufslisten für Familie und Freunde – als installierbare Web-App für Android und Desktop.

- **Keine Server, keine Kosten.** Die App wird als statische Seite über GitHub Pages ausgeliefert.
- **Deine Daten bleiben bei dir.** Sie liegen auf deinen Geräten und, Ende-zu-Ende verschlüsselt, in deinem eigenen Cloud-Speicher (zunächst Google Drive). Das Projekt sieht keine Nutzerdaten.
- **Offen.** Code unter [AGPL-3.0-or-later](LICENSE), Rezepte und Zutatenkatalog unter [CC BY-SA 4.0](catalog/LICENSE).

> **Stand:** Phase 4, Teil A (Rezept-Import) – siehe [Planung](plan/README.md).

## Entwicklung

Voraussetzungen: Node.js 24 (siehe `.nvmrc`) und pnpm über Corepack (`corepack enable`).

```sh
pnpm install
cp .env.example .env.local   # Google-Konfiguration eintragen, siehe docs/setup/google-cloud.md
pnpm dev                     # http://localhost:5173
```

| Befehl                             | Zweck                                                     |
| ---------------------------------- | --------------------------------------------------------- |
| `pnpm lint`                        | ESLint, inklusive Architektur-Grenzen und XSS-Regeln      |
| `pnpm format:check`                | Prettier                                                  |
| `pnpm typecheck`                   | `vue-tsc`                                                 |
| `pnpm test` / `pnpm test:coverage` | Unit-Tests (Vitest)                                       |
| `pnpm build`                       | Produktions-Build nach `dist/`                            |
| `pnpm test:e2e`                    | Playwright (Chromium, Firefox, Android-Emulation) mit axe |
| `pnpm licenses:check`              | Lizenzen der Abhängigkeiten gegen die Allowlist           |

## Aufbau

```
src/core/       Domäne ohne Framework (Krypto, Sync, Modell, Rezepte, Katalog)
src/providers/  Speicheranbieter (gdrive/)
src/ui/         Design-Tokens und Basis-Komponenten
src/app/        Router, Start, PWA
auth/           OAuth-Rückkehrseite außerhalb des Routers
catalog/        öffentliche Rezepte und Zutatenkatalog (CC BY-SA 4.0)
docs/           ADRs, Bedrohungsmodell, Setup-Anleitungen
plan/           Planung
```

Details: [Architektur](plan/01-architektur.md), [Bedrohungsmodell](docs/threat-model.md).

## Mitmachen

Siehe [CONTRIBUTING.md](CONTRIBUTING.md). Sicherheitslücken bitte nicht öffentlich melden, sondern wie in [SECURITY.md](SECURITY.md) beschrieben.
