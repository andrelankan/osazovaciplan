# Osazovací plán

Interní nástroj pro kreslení osazovacích plánů — podklad z PDF v měřítku, obkreslení
záhonů (i s oblými stranami), rozdělení na výškové oblasti a plochy jednotlivých
rostlin, automatické počty kusů, skupiny keřů, stromy, tisk v přesném měřítku
a výkaz rostlin k objednávce.

```bash
npm run dev
```

Běží na <http://localhost:3000>, tisková sestava na `/tisk`.

## Postup

Aplikace vede krok za krokem, levý sloupec drží návod i nástroje daného kroku.

1. **Podklad a měřítko** — zadej měřítko výkresu (1:100) a nahraj PDF. Skutečné
   rozměry se dopočítají z velikosti stránky, není potřeba nic měřit. U rastrového
   obrázku měřítko známé není — nástroj **Kalibrace**: dva body o známé vzdálenosti.
2. **Obrys záhonu** — obkresli okraj. Enter uzavře, Esc zruší, Backspace vezme zpět
   poslední bod, Shift drží úhel po 45°. Zmáčknutím číslice zadáš přesnou délku
   a úhel další strany. Oblé strany: nástrojem Výběr chytni kulaté táhlo uprostřed
   strany a táhni, nebo napiš přesné „prohnutí" v panelu Vlastnosti.
3. **Výškové oblasti** — nástrojem **Rozdělit čarou** táhni přes záhon a rozdělí se
   na dvě části. Pak nástrojem **Označit výšku** klikáním přiřaď částem nízké /
   střední / vysoké. Oblast je vlastností části záhonu, ne samostatná kresba přes
   něj — při dalším dělení se výška přenese do obou částí.
4. **Rostliny do ploch** — rozděl oblasti dál na plošky, klikni na plošku a v
   katalogu vpravo klikni na rostlinu. Vypíše se `Kód` + počet kusů spočítaný
   z plochy a hustoty výsadby; počet jde ručně přepsat. Uvnitř výškové oblasti
   katalog řadí nahoru rostliny odpovídající výšky a ostatní tlumí.
5. **Keře a stromy** — nejdřív vyber rostlinu v katalogu, pak kresli. Keře jako
   spojené tečky s celým názvem kurzívou (počet z délky řady a rozestupu), stromy
   jako tučná tečka s tenkou kružnicí koruny ve skutečném průměru.
6. **Kóty, tisk a výkaz** — tisk v přesném měřítku (1 m = 10 mm při 1:100) na
   A4–A1, na druhém listu výkaz rostlin; výkaz zvlášť do CSV.

Vrstvy jsou poskládané tak, že **vybarvení záhonů je pod rastrem podkladu**
(podklad se překrývá režimem *násobení*, takže bílá zmizí a cyan rastr zůstane),
ale **popisky jsou nad vším** a jsou tedy vždy čitelné.

## Databáze rostlin

Zdrojem je `data/rostliny.tsv` — jeden řádek na rostlinu, sloupce oddělené
tabulátorem. Po úpravě spusť:

```bash
npm run db
```

Tím se vygeneruje `public/data/plants.json`, ze kterého čte aplikace.

Sloupce: `kod`, `latin`, `cesky`, `kat`, `svetlo`, `vyska`, `kvet`, `barva`,
`pozn`, `hustota`.

| `kat` | | | `svetlo` | |
|---|---|---|---|---|
| T | trvalka | | S | slunce |
| G | travina | | P | polostín |
| F | kapradina | | N | stín |
| C | cibulovina | | | (lze kombinovat: `SP`) |
| K | keř | | | |
| S | strom | | | |
| J | jehličnan | | | |
| U | užitková dřevina | | | |

**Kódy jsou převzaté z tabulky rostlin na Google Drive** (`Ach`, `AjM`, `PoA`,
`GerA`, `HipJ`…). Tam, kde měla tabulka jeden kód pro víc rostlin, je přidané
čtvrté písmeno podle kultivaru — stejným způsobem, jakým to tabulka už dělá
u `GerA`, `SalR`, `PoA`/`PoK`, `HyA`/`HyB`:

| v tabulce | v databázi |
|---|---|
| `Ech` ×3 | `Ech` (*purpurea*), `EchA` ('Alba'), `EchG` ('Green Jewel') |
| `Del` ×2 | `DelA` ('Astolat'), `DelK` ('King Arthur') |
| `Leu` ×2 | `LeuM` ('Madonna'), `LeuA` ('Alaska') |
| `Mis` ×2 | `MisG` ('Giganteus'), `MisS` (*sinensis*) |
| `Per` ×2 | `PerL` ('Little Spire'), `PerS` ('Steel Blue') |
| `Cor` ×4 | `Cor` (*Coreopsis*), `CorA`/`CorK`/`CorS` (*Cornus*) |

Stejně tak `Ame` (v tabulce jednou Aster, jednou Amelanchier) je jen *Aster
amellus*, muchovník má svůj vlastní kód `Aml`, který tabulka taky používá.

**Hustota (ks/m²)** je vyplněná u všech rostlin podle běžného školkařského sponu
pro daný druh a vzrůst. Je to orientační hodnota k projetí a opravě — právě z ní
se počítají kusy ve výkazu. Změnit ji jde natrvalo v `rostliny.tsv`, nebo rychle
přímo v aplikaci (panel *Vlastnosti*), kde se uloží lokálně v prohlížeči.

Sloupce `rozestup` (pro řady keřů) a `koruna` (průměr koruny stromů) se dopočítají
z hustoty a výšky; u konkrétního stromu či skupiny je lze přepsat ve Vlastnostech.

## Fotky

Stáhni si z Google Drive složku `ROSTLINY` jako ZIP, rozbal a spusť:

```bash
node scripts/import-fotky.mjs "C:\cesta\k\rozbalenym\fotkam"
```

Fotky se napárují podle latinského názvu, zkopírují do `public/fotky` a skript
vypíše, co se nespárovalo. Pak `npm run db`.

## Ukládání

Rozpracovaný plán se průběžně ukládá do prohlížeče (localStorage), podklad do
IndexedDB. Tlačítky **Uložit / Otevřít** se plán exportuje do souboru `.plan.json`,
který se dá archivovat u zakázky nebo poslat kolegovi.

## Co zatím není

- **Import a export DXF** — podklad jde vložit jen jako PDF nebo obrázek, ven jde
  tisk do PDF a výkaz do CSV.
- Řezy a pohledy — nástroj je čistě půdorysný.
