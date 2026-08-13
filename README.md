# Osazovací plán

Interní nástroj pro osazovací plány. Vede krok za krokem: nahraješ plánek zahrady
v měřítku, obkreslíš záhon, načrtneš do něj výškové oblasti a vybereš rostliny —
**plochy si program rozvrhne sám**. Z toho vypadne výkres v měřítku a výkaz rostlin
k objednávce.

```bash
npm run dev     # editor na http://localhost:3000
npm test        # kontrola rozvrhovacího algoritmu
npm run db      # přegenerovat databázi rostlin z data/rostliny.tsv
```

## Postup

Na obrazovce je vždycky jen to, co patří k aktuálnímu kroku.

1. **Podklad** — nahraj plánek jako PDF a zadej měřítko, ve kterém je vykreslený
   (obvykle 1:100). Skutečné rozměry se dopočítají z velikosti stránky.
2. **Obrys záhonu** — obkresli okraj záhonu. Enter uzavře, Backspace vezme zpět bod,
   Shift drží úhel po 45°, číslicí zadáš přesnou délku a úhel strany. Přepínačem
   *Upravit tvar* pak jde tahat vrcholy a kulatým táhlem uprostřed strany ji vyklenout
   do oblouku.
3. **Výškové oblasti** — jen zhruba načrtni tah tam, kde chceš nízké, a tam, kde
   vysoké rostliny. Program dopočítá celé oblasti tak, aby vyplnily záhon až k okraji
   a nikde ho nepřesáhly. Rozlišené jsou barvou.
4. **Rostliny** — ke každé výškové oblasti vybereš rostliny a jezdcem jejich vzájemný
   podíl. Plochy se rozvrhnou samy: každá rostlina dostane odpovídající kus záhonu,
   větší podíly se rozpadnou na víc skupin roztroušených po ploše, jako na ručně
   kreslených plánech. Do popisku jde kód a počet kusů spočítaný z plochy a hustoty
   výsadby. Tlačítko *Přeházet rozmístění* nabídne jinou variantu téhož zadání.
5. **Keře** — vyber keř a naklikej řadu. Vykreslí se jako spojené tečky s celým názvem
   kurzívou, počet vyjde z délky řady a rozestupu.
6. **Stromy** — vyber strom a klikni, kam ho zasadit. Tenká kružnice je koruna ve
   skutečném průměru.
7. **Tisk a výkaz** — výkres v přesném měřítku (1 m = 10 mm při 1:100) na A4–A1,
   na druhém listu výkaz rostlin; výkaz zvlášť do CSV pro objednávku.

V každém kroku se nabízejí **jen rostliny, které do něj patří** — u stromů se trvalky
vůbec nezobrazí.

Vrstvy jsou poskládané tak, že **vybarvení záhonů je pod rastrem podkladu** (podklad
se překrývá režimem *násobení*, takže bílá zmizí a cyan rastr zůstane), ale **popisky
jsou nad vším**, a jsou tedy vždy čitelné.

## Jak funguje rozvrh záhonu

Jádro je v [lib/rozvrh.ts](lib/rozvrh.ts). Záhon se pokryje rastrem buněk (velikost
se volí podle plochy, zhruba 2 600 buněk na záhon). Každá buňka připadne nejbližšímu
načrtnutému tahu — tím vzniknou výškové oblasti. Uvnitř oblasti pak každá buňka
připadne nejbližšímu „semenu" rostliny, přičemž **kvóta se hlídá za rostlinu**, takže
výsledné podíly ploch odpovídají zadání. Z buněk se vytrasuje obrys, vyhladí
Chaikinovým algoritmem a ořízne obrysem záhonu.

Dvě věci, na kterých to stojí a které se snadno rozbijí:

- Buňka se počítá, i když do záhonu zasahuje jen rohem — jinak by po obvodu zůstal
  nevyplněný proužek až půl buňky široký.
- **Vyhlazuje se před zjednodušením**, ne naopak. Na surovém „schodišti" z buněk
  zaoblí Chaikin jen schody; kdyby se ale nejdřív zjednodušilo, udělal by z dlouhých
  rovných stran oblouky a plocha by se srazila o 15 %.

Obojí hlídá `npm test` měřením, ne od oka: kontroluje, že plochy vyplní záhon
(vychází 100 %), nepřesáhnou ven, sedí podíly a popisky leží uvnitř svých ploch.

## Databáze rostlin

Zdrojem je `data/rostliny.tsv` — jeden řádek na rostlinu, sloupce oddělené tabulátorem.
Po úpravě spusť `npm run db`, tím se vygeneruje `public/data/plants.json`.

Sloupce: `kod`, `latin`, `cesky`, `kat`, `svetlo`, `vyska`, `kvet`, `barva`, `pozn`,
`hustota`.

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

**Kódy jsou převzaté z tabulky rostlin na Google Drive** (`Ach`, `AjM`, `PoA`, `GerA`,
`HipJ`…). Tam, kde měla tabulka jeden kód pro víc rostlin, je přidané čtvrté písmeno
podle kultivaru — stejným způsobem, jakým to tabulka už dělá u `GerA`, `SalR`,
`PoA`/`PoK`, `HyA`/`HyB`:

| v tabulce | v databázi |
|---|---|
| `Ech` ×3 | `Ech` (*purpurea*), `EchA` ('Alba'), `EchG` ('Green Jewel') |
| `Del` ×2 | `DelA` ('Astolat'), `DelK` ('King Arthur') |
| `Leu` ×2 | `LeuM` ('Madonna'), `LeuA` ('Alaska') |
| `Mis` ×2 | `MisG` ('Giganteus'), `MisS` (*sinensis*) |
| `Per` ×2 | `PerL` ('Little Spire'), `PerS` ('Steel Blue') |
| `Cor` ×4 | `Cor` (*Coreopsis*), `CorA`/`CorK`/`CorS` (*Cornus*) |

`Ame` (v tabulce jednou Aster, jednou Amelanchier) je jen *Aster amellus*, muchovník
má vlastní kód `Aml`, který tabulka taky používá.

**Hustota (ks/m²)** je vyplněná u všech rostlin podle běžného školkařského sponu pro
daný druh a vzrůst. Je to orientační hodnota k projetí a opravě — počítají se z ní kusy
ve výkazu.

## Fotky

Stáhni z Google Drive složku `ROSTLINY` jako ZIP, rozbal a spusť:

```bash
node scripts/import-fotky.mjs "C:\cesta\k\rozbalenym\fotkam"
```

Fotky se napárují podle latinského názvu, zkopírují do `public/fotky` a skript vypíše,
co se nespárovalo. Pak `npm run db`.

## Ukládání

Rozpracovaný plán se průběžně ukládá do prohlížeče (localStorage), podklad do IndexedDB.
Tlačítky **Uložit / Otevřít** se plán exportuje do souboru `.plan.json` k archivaci
u zakázky.

## Co zatím není

- **Import a export DXF** — podklad jde vložit jen jako PDF nebo obrázek, ven jde tisk
  do PDF a výkaz do CSV.
- Řezy a pohledy — nástroj je čistě půdorysný.
- Fotky v katalogu (skript je připravený, fotky zatím nenaimportované).
