#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Auszug aus dem Bundeslebensmittelschlüssel 4.0 für catalog/nutrition/ (ADR 0004).

  python3 -I tools/bls-extract.py <BLS_4_0_Daten_2025_DE.xlsx>

Liest die Codes aus catalog/nutrition/zuordnung.yaml und schreibt nur diese
Lebensmittel mit den angezeigten Nährstoffen je 100 g nach
catalog/nutrition/bls-4.0-auszug.csv. Nur Standardbibliothek: die xlsx-Datei
ist ein ZIP mit XML. Die Quelldatei liegt nicht im Repo (Download: blsdb.de).
"""

import csv
import re
import sys
import zipfile
from pathlib import Path
from xml.etree.ElementTree import iterparse

ROOT = Path(__file__).resolve().parent.parent
MAPPING = ROOT / 'catalog' / 'nutrition' / 'zuordnung.yaml'
TARGET = ROOT / 'catalog' / 'nutrition' / 'bls-4.0-auszug.csv'
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# Spalte in der Ausgabe → Nährstoffcode im BLS (Kopfzeile beginnt mit dem Code)
COLUMNS = {
    'kcal': 'ENERCC',
    'kj': 'ENERCJ',
    'fett': 'FAT',
    'fett_gesaettigt': 'FASAT',
    'kohlenhydrate': 'CHO',
    'zucker': 'SUGAR',
    'ballaststoffe': 'FIBT',
    'eiweiss': 'PROT625',
    'salz': 'NACL',
}


def col_index(ref: str) -> int:
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def rows(xlsx: Path):
    with zipfile.ZipFile(xlsx) as z:
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            with z.open('xl/sharedStrings.xml') as f:
                for _, el in iterparse(f):
                    if el.tag == NS + 'si':
                        strings.append(''.join(t.text or '' for t in el.iter(NS + 't')))
                        el.clear()
        sheet = sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet'))[0]
        with z.open(sheet) as f:
            for _, el in iterparse(f):
                if el.tag != NS + 'row':
                    continue
                row = {}
                for c in el.iter(NS + 'c'):
                    v = c.find(NS + 'v')
                    if v is None:
                        inline = c.find(NS + 'is')
                        text = ''.join(t.text or '' for t in inline.iter(NS + 't')) if inline is not None else None
                    elif c.get('t') == 's':
                        text = strings[int(v.text)]
                    else:
                        text = v.text
                    row[col_index(c.get('r'))] = text
                el.clear()
                yield row


def number(text):
    t = '' if text is None else str(text).strip()
    # Fehlender Wert (leer oder „-“) ist nicht 0 (Dokumentation 4.3): leer lassen.
    if t in ('', '-'):
        return ''
    # Spuren („TR“) und unter Nachweis-/Bestimmungsgrenze („<LOD“, „<LOQ“): 0.
    if t == 'TR' or t.startswith('<'):
        return '0'
    value = float(str(text).replace(',', '.'))
    return f'{value:.3f}'.rstrip('0').rstrip('.')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    wanted = set(re.findall(r'bls:\s*([A-Z0-9]{7})', MAPPING.read_text(encoding='utf-8')))
    it = rows(Path(sys.argv[1]))
    header = next(it)
    index = {}
    for i, h in header.items():
        code = str(h or '').split(' ')[0]
        if code in COLUMNS.values() and 'Datenherkunft' not in h and 'Referenz' not in h:
            index[code] = i
    missing = [c for c in COLUMNS.values() if c not in index]
    if missing:
        sys.exit(f'Spalten fehlen: {missing}')
    found = {}
    for row in it:
        code = row.get(0)
        if code in wanted:
            found[code] = [code, row.get(1)] + [number(row.get(index[c])) for c in COLUMNS.values()]
    absent = sorted(wanted - found.keys())
    if absent:
        sys.exit(f'Nicht im BLS gefunden: {absent}')
    with TARGET.open('w', encoding='utf-8', newline='') as f:
        f.write('# Auszug aus: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 —\n')
        f.write('# Deutsche Nährstoffdatenbank. Karlsruhe. DOI: 10.25826/Data20251217-134202-0\n')
        f.write('# Lizenz CC BY 4.0. Geändert: gekürzt auf ausgewählte Lebensmittel und Nährstoffe, Werte je 100 g.\n')
        w = csv.writer(f, delimiter=';', lineterminator='\n')
        w.writerow(['bls', 'name', *COLUMNS.keys()])
        for code in sorted(found):
            w.writerow(found[code])
    print(f'{len(found)} Lebensmittel → {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
