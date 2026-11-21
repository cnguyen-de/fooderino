# Season calendar sources

Provenance for `SEASON_CALENDAR` in `utils/seasons/calendar.ts`, the built-in German season calendar (75 entries: 48 vegetables, 27 fruits). Researched 2026-11-21.

## What "in season" means

For produce grown in Germany, an item is in season in the months of the regional harvest. That covers open-field (Freiland) months and unheated protected months (foil or fleece). Storage months count only for winter storage crops and only from October to March. Imports with a clear season in German shops (citrus, lychee, persimmon, pomegranate, chestnuts, figs, melons) use the months of their main import supply. Items that are on offer all year at constant quality are left out. Windows are whole months, inclusive, and may wrap past December.

## Method

Three independent calendars are the core sources:

- **VZ.** The Verbraucherzentrale "Heimisches Obst und Gemüse" calendar. It marks each month as open field, protected (foil or unheated greenhouse), storage, or heated greenhouse.
- **KErn.** The Bavarian calendar from the Kompetenzzentrum für Ernährung. It marks each month as Hauptsaison or Nebensaison.
- **BZfE.** The Bundeszentrum für Ernährung poster. It shows the domestic share of supply per month (hatched) against imports (plain).

A month is in the window when at least two of these three agree:

- VZ shows open field, foil, or unheated protected growing, or storage from October to March. Months that VZ marks only as heated greenhouse never count.
- KErn marks the month as Hauptsaison. Nebensaison counts only when BZfE does not list the item.
- BZfE shows clear domestic supply. A sliver at the start or end of a month does not count.

For items that only one or two of the three list, the window is where the available sources agree. In that case the WWF calendar (which credits the VZ data) and Lebensmittellexikon serve as a tiebreak. Import windows come from BZfE's months of high import supply, checked against the origin months on Lebensmittellexikon. The few overrides are listed below.

## Sources read

- VZ Hamburg, Saisonkalender 2022 (PDF): https://www.vzhh.de/sites/default/files/medien/136/dokumente/Verbraucherzentrale_Saisonkalender_2022_WEB.pdf
- VZ poster A3, 6th edition, November 2022 (PDF): https://www.verbraucherzentrale-bawue.de/sites/default/files/2023-02/saisonkalender_poster_a3.pdf
- VZ overview with extra notes (PDF, same data as the 2022 edition): https://www.verbraucherzentrale.de/sites/default/files/2023-01/vz-saisonkalender.pdf
- VZ season calendar page, as of 3 June 2025: https://www.verbraucherzentrale.de/wissen/lebensmittel/gesund-ernaehren/saisonkalender-obst-und-gemuese-frisch-und-saisonal-einkaufen-17229
- BZfE season calendar page: https://www.bzfe.de/nachhaltiger-konsum/orientierung-beim-einkauf/der-saisonkalender/
- BZfE poster image, watermarked and low resolution: https://www.bzfe.de/fileadmin/user_upload/K%C3%BCche_und_Alltag/Einkaufen/Saisonkalender_Ansicht_Wasserzeichen.jpg
- KErn Bayern, Saisonkalender (PDF): https://www.kern.bayern.de/mam/cms03/shop/flyer/dateien/200407_final__kern_saisonkalender_barrierefrei_neu.pdf
- WWF, "Essen im Rhythmus der Natur" (PDF, credits the VZ data): https://www.wwf.de/fileadmin/fm-wwf/Publikationen-PDF/Saisonkalender-Essen_im_Rhythmus_der_Natur.pdf
- Lebensmittellexikon, fruit calendar with domestic and import months by origin: https://www.lebensmittellexikon.de/saisonkalender/obst/
- Utopia on wild garlic: https://utopia.de/ratgeber/baerlauch-saison-wann-baerlauch-waechst-tipps-zur-ernte/

The BZfE PDF links that search engines return now give 404 errors, so the BZfE readings come from the image above. The image is low resolution and watermarked, so BZfE edges are read to about half a month.

## Disagreements and overrides

- **Erdbeeren, May to July.** VZ shows open-field strawberries from June to September, with foil-grown ones in May and October. KErn's Hauptsaison is May to July. BZfE's domestic supply peaks from May to July. August and September have only VZ support. BZfE also has a faint hatched band from October to December that no other source shows, so it was ignored.
- **Feldsalat, October to March (override).** All three sources show regional lamb's lettuce in every month, from open field in summer and unheated greenhouses in winter. Applied strictly, the rule would make it a year-round item. The window is set to the traditional autumn and winter season, which KErn marks as Hauptsaison (October to December) and which BZfE shows as a domestic peak.
- **Lauch, September to March (override).** VZ shows open-field leek in every month. KErn's Hauptsaison is July to December. BZfE shows domestic supply all year, peaking from September to December. The window is the winter-leek season, which ends when the stored and overwintered crop runs out. Treat this as a judgment call. Under the year-round rule, leek could be dropped instead.
- **Rettich, May to November.** BZfE's winter months for Rettich cannot be read under the watermark. VZ open field (May to November) and KErn Hauptsaison (May to October) decide the window.
- **Rotkohl and Weißkohl, May to March.** VZ (one row for red cabbage, white cabbage and Savoy) shows foil-grown early cabbage in May and June, open field from July to November, and storage from December. With storage capped at March, only April falls outside the window. That is what the sources say, even though it makes the window long. KErn marks white cabbage as Hauptsaison in nearly every month. Its April entry is storage stock and does not count.
- **Wirsing, July to February.** BZfE has no separate row for Savoy cabbage. KErn marks it from July to February, and VZ storage carries it into March. With only two sources, March has VZ support alone.
- **Kürbis, July to December.** VZ shows open field from July to October and storage from November to February. KErn's Hauptsaison is August to November. BZfE shows domestic supply from July to December. In January only VZ storage remains, plus KErn Nebensaison, which does not count. Hokkaido and other squash share one entry because no source separates them.
- **Chinakohl, May to February.** VZ shows open field from June to November, foil in May, and storage from December to March. KErn and BZfE both show January and February, so those months count. March has VZ storage only.
- **Pflaumen, August to September.** VZ and the KErn Hauptsaison agree exactly. BZfE's broader June to October band only shows that supply is possible then.
- **Weintrauben, September to October.** VZ shows August to October. BZfE's domestic band starts in mid-August. Lebensmittellexikon gives the German season as September to October.
- **Brombeeren, July to September.** VZ runs to October. BZfE's domestic supply ends in mid-October.
- **Rhabarber, March to June.** VZ shows foil-grown rhubarb from February and open field from April to June. BZfE shows domestic supply from March. KErn's Hauptsaison is April to May.
- **Paprika and Auberginen.** VZ lists no open-field months for either. Both grow in unheated or lightly heated greenhouses from June to October. BZfE's domestic aubergine band starts in mid-June, so aubergines run from July to October. Paprika runs from June to October.
- **Tomaten, May to October.** VZ marks May and October tomatoes as mixed heated and unheated greenhouse, and April and November as heated only. KErn and BZfE carry the May and October edges. April and November are out because VZ marks them heated only.
- **Gurken, April to October.** Salad cucumbers are a greenhouse crop. VZ marks April to October as mixed heated and unheated, and February, March and November as heated only. KErn's Hauptsaison is April to September. BZfE shows domestic supply from March to October. Pickling cucumbers (Einlegegurken) grow in open fields from June to September and share the entry.
- **Holunderbeeren, August to September.** WWF gives August to September. Lebensmittellexikon gives September to October. VZ, KErn and BZfE do not list elderberries. The window follows the WWF (VZ-derived) reading.
- **Pak Choi, October to December.** Only KErn lists pak choi, as Nebensaison. This is a single source.
- **Bärlauch, March to April.** None of the three calendars lists wild garlic. Utopia gives the season as mid-March to early May, ending when the plant flowers. Early May was left out. This is a single source.
- **Frühlingszwiebeln, Romanasalat, Steckrüben, Topinambur, Pastinaken, Petersilienwurzel.** BZfE does not list these, so the window is VZ and KErn where they agree. For Frühlingszwiebeln, Romanasalat, Steckrüben and Topinambur it is VZ and WWF.

### Imports

| Entry | Window | BZfE (high import months) | Lebensmittellexikon |
| --- | --- | --- | --- |
| Mandarinen | Nov to Feb | Nov to Feb | not listed |
| Orangen | Nov to Apr | Nov to Mar high, Apr medium | Southern Europe Nov to Apr |
| Litschis | Nov to Feb | Dec to Jan high, Feb medium, Nov low | Madagascar Nov to Jan, South Africa Nov to Mar |
| Granatäpfel | Oct to Jan | Oct to Jan | Mediterranean and Iran Aug to Dec |
| Kakis | Oct to Dec | Oct to Dec, Jan half | Italy, Spain, Turkey Oct to Dec |
| Esskastanien | Oct to Dec | Nov to Dec high, Oct with a small domestic share | Germany Sep to Oct, Europe Oct to Mar |
| Feigen | Sep to Oct | Sep to Oct | Mediterranean Jun to Oct |
| Melonen | Jun to Sep | imports high Jun to Aug, domestic Jul to Sep | Germany Jul to Sep, Southern Europe Apr to Oct |
| Wassermelonen | Jun to Sep | imports high Jun to Aug, domestic Jul to Sep | Europe and Turkey Mar to Nov |

Mandarinen and Clementinen rest on BZfE alone, because Lebensmittellexikon has no row for them.

## Household items left out

- **Available all year at constant quality.** Avocado, Bananas, Lime, Ginger, Mango, Dứa (pineapple), Champignon and Nấm (cultivated mushrooms), Giá (bean sprouts), and Water chestnut (sold canned or imported all year). BZfE draws avocado, banana, lime, mango and pineapple as steady import bars, and shows Champignons as domestic all year.
- **Storage staples available regionally all year.** Carrot (Möhren), Kartoffel and Potato 🥔, Zwiebeln, Schalloten, and Tỏi (garlic). VZ shows these from storage or open field in every month.
- **Herbs and chillies.** Coriander and Chilli. The calendars list herbs separately, and supermarkets sell both from greenhouses or imports all year.
- **Asian produce Germany does not grow commercially.** Củ sen and Ngó sen (lotus root and stem), Khoai môn and Khoai sọ (taro), Sắn (cassava), Tía tô (perilla), Mùi tàu (culantro), Sả and Sả que (lemongrass), Măng (bamboo shoots), Cải cúc (chrysanthemum greens), Cải ngọt (choy sum), and Cải chua (pickled mustard greens).
- **Ambiguous names.** Cà (could be tomato, aubergine or another nightshade) and Cải (any brassica green).

## Household log against the chosen window

The months are those in which the household log (2025-05 to 2026-11) shows an add for each item. "Off-window" lists the months outside the chosen window. These are expected for imports and greenhouse produce bought out of season, and they are not errors in the calendar.

| Household name | Entry | Window | Months bought | Result |
| --- | --- | --- | --- | --- |
| Aubergine | Auberginen | Jul to Oct | Aug | in window |
| Broccoli | Brokkoli | Jun to Nov | Dec, Jun | off-window Dec |
| Buschbohnen | Bohnen | Jun to Oct | Sep, Sep | in window |
| Stangenbohnen | Bohnen | Jun to Oct | May, May | off-window May (likely imported) |
| Bắp ngô | Zuckermais | Aug to Oct | Aug, Apr, Oct | off-window Apr (import) |
| Chinakohl | Chinakohl | May to Feb | Aug, Nov, Jul, Oct, Nov | in window |
| Erbsen | Erbsen | Jun to Sep | Feb | off-window Feb (likely frozen) |
| Erdbeer | Erdbeeren | May to Jul | May, Dec | off-window Dec (import) |
| Gurken | Gurken | Apr to Oct | all year | off-window Dec to Mar (imports, heated greenhouse) |
| Hokkaido Kürbis | Kürbis | Jul to Dec | Sep | in window |
| Pumpkin | Kürbis | Jul to Dec | Oct | in window |
| Hành lá | Frühlingszwiebeln | May to Nov | May to Aug, Dec, Sep | off-window Dec |
| Kirsch | Kirschen | Jun to Aug | Jun | in window |
| Kohlrabi | Kohlrabi | May to Nov | Jun, Jul, Dec, Feb, May, Sep | off-window Dec, Feb |
| Lollo Bionda, Lollo bionda, Lollo bionda letuce | Lollo Bionda | Apr to Nov | Jul, Oct, Nov, Jan, Feb, Sep | off-window Jan, Feb |
| Lychee | Litschis | Nov to Feb | Jun, Feb | off-window Jun (Asian lychee season, outside the main German import window) |
| Mandarines | Mandarinen | Nov to Feb | Sep | off-window Sep (early or southern-hemisphere import) |
| Maronen | Esskastanien | Oct to Dec | Dec, Jan | off-window Jan |
| Nho | Weintrauben | Sep to Oct | Sep | in window |
| Oranges | Orangen | Nov to Apr | none logged | no data |
| Pakchoi | Pak Choi | Oct to Dec | Jul, Sep, Jul | off-window Jul, Sep (Asian shop import) |
| Paprika | Paprika | Jun to Oct | Jan, Mar, Jun | off-window Jan, Mar |
| Plattpfirsich | Pfirsiche | Jul to Sep | May, Sep | off-window May (Spanish import) |
| Rote bete | Rote Bete | Jul to Mar | Sep | in window |
| Rucola | Rucola | Mar to Nov | Sep, Dec, Jan, Jun | off-window Dec, Jan |
| Spinat | Spinat | Apr to Nov | year round | off-window Dec to Feb |
| Tomato, Tomatoes, Cherry tomatoes | Tomaten | May to Oct | all year | off-window Nov to Mar |
| Urkohl | Grünkohl | Oct to Mar | May, Jun, Oct, Nov, Jan, Aug | off-window May, Jun, Aug |
| Wassermelon | Wassermelonen | Jun to Sep | May | off-window May |
| Wirsing | Wirsing | Jul to Feb | Oct | in window |

Urkohl is the weakest match. No source read for this calendar lists it. It is attached to Grünkohl as the closest leaf kale, but the household buys it in summer too. If Urkohl turns out to be a year-round product, drop the alias.
