# Rezepte schreiben

Tafelrunde verwendet [Cooklang](https://cooklang.org/docs/spec/). Zutaten stehen dort im Text, wo sie gebraucht werden.

```cooklang
---
title: Zwetschgenkuchen
servings: 12
tags: [Kuchen, Hefe]
time.prep: 30 min
time.cook: 40 min
source: Oma Liesl
---
== Teig ==
Rolle @./Hefeteig{500%g} aus und lege ihn in eine #Backform{}.

== Belag ==
Belege mit @Zwetschgen{1,5%kg}, streue @Zimt{=1%Prise} und @Zucker{80%g} darüber.
Backe ~{40%Minuten} bei 180 °C.

> Schmeckt lauwarm am besten.
```

## Front Matter

| Feld                     | Bedeutung                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `title`                  | Titel, Pflicht                                                                                 |
| `servings`               | Portionen (Zahl) – Grundlage fürs Skalieren                                                    |
| `yield`                  | Ausbeute mit Einheit, z. B. `800 g` – für Rezepte, die andere verwenden                        |
| `tags`                   | Liste, z. B. `[Kuchen, Hefe]`                                                                  |
| `time.prep`, `time.cook` | Dauer, z. B. `20 min`, `1 h 30 min`                                                            |
| `source`                 | Quelle (Person, Buch oder Link)                                                                |
| `description`            | kurze Beschreibung                                                                             |
| `diet`                   | überschreibt die abgeleitete Ernährungsform: `vegan`, `vegetarisch`, `pescetarisch`, `omnivor` |

## Zutaten, Geschirr, Timer

| Schreibweise             | Bedeutung                                         |
| ------------------------ | ------------------------------------------------- |
| `@Salz{}`                | Zutat ohne Menge                                  |
| `@Mehl{500%g}`           | Menge und Einheit; Dezimalkomma erlaubt: `1,5%kg` |
| `@Eier{2-3}`             | Spanne                                            |
| `@Zimt{=1%Prise}`        | fixe Menge, skaliert nicht mit                    |
| `@?Petersilie{1%Bund}`   | optional                                          |
| `@Zwiebel{1}(gewürfelt)` | Zubereitungshinweis                               |
| `#Backform{}`            | Kochgeschirr                                      |
| `~{40%Minuten}`          | Timer; Einheiten `s`, `min`, `h`                  |
| `== Teig ==`             | Abschnitt                                         |
| `> Text`                 | Notiz                                             |

## Referenzen auf andere Rezepte

`@./Hefeteig{500%g}` verwendet 500 g aus dem Rezept „Hefeteig“. Gesucht wird zuerst im selben Bereich nach dem Titel, dann im öffentlichen Katalog (`@./backen/Hefeteig` für einen Pfad im Katalog). Hat das Unterrezept eine Ausbeute (`yield: 800 g`), skalieren seine Mengen entsprechend (500/800). Zyklen werden beim Speichern abgelehnt.
