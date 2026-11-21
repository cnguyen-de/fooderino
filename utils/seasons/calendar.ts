import type { CalendarEntry } from '~~/types/season';

export const SEASON_CALENDAR: readonly CalendarEntry[] = [
  { name: 'Äpfel', aliases: ['Apple', 'Apples'], kind: 'fruit', season: { from: 8, to: 3 } },
  {
    name: 'Aprikosen',
    aliases: ['Aprikose', 'Marillen', 'Apricot', 'Apricots'],
    kind: 'fruit',
    season: { from: 7, to: 8 }
  },
  {
    name: 'Auberginen',
    aliases: ['Aubergine', 'Melanzani', 'Eggplant'],
    kind: 'vegetable',
    season: { from: 7, to: 10 }
  },
  { name: 'Bärlauch', aliases: ['Wild garlic', 'Ramsons'], kind: 'vegetable', season: { from: 3, to: 4 } },
  { name: 'Birnen', aliases: ['Birne', 'Pear', 'Pears'], kind: 'fruit', season: { from: 8, to: 2 } },
  { name: 'Blumenkohl', aliases: ['Cauliflower'], kind: 'vegetable', season: { from: 5, to: 11 } },
  {
    name: 'Bohnen',
    aliases: ['Grüne Bohnen', 'Buschbohnen', 'Stangenbohnen', 'Prinzessbohnen', 'Green beans', 'French beans'],
    kind: 'vegetable',
    season: { from: 6, to: 10 }
  },
  { name: 'Brokkoli', aliases: ['Broccoli'], kind: 'vegetable', season: { from: 6, to: 11 } },
  {
    name: 'Brombeeren',
    aliases: ['Brombeere', 'Blackberries', 'Blackberry'],
    kind: 'fruit',
    season: { from: 7, to: 9 }
  },
  {
    name: 'Chinakohl',
    aliases: ['Napa cabbage', 'Chinese cabbage', 'Cải thảo'],
    kind: 'vegetable',
    season: { from: 5, to: 2 }
  },
  {
    name: 'Dicke Bohnen',
    aliases: ['Saubohnen', 'Ackerbohnen', 'Broad beans', 'Fava beans'],
    kind: 'vegetable',
    season: { from: 6, to: 8 }
  },
  { name: 'Eisbergsalat', aliases: ['Eisberg', 'Iceberg lettuce'], kind: 'vegetable', season: { from: 5, to: 10 } },
  {
    name: 'Endiviensalat',
    aliases: ['Endivie', 'Endivien', 'Frisée', 'Escariol', 'Endive'],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  { name: 'Erbsen', aliases: ['Erbse', 'Peas', 'Green peas'], kind: 'vegetable', season: { from: 6, to: 9 } },
  {
    name: 'Erdbeeren',
    aliases: ['Erdbeer', 'Erdbeere', 'Strawberries', 'Strawberry', 'Dâu tây'],
    kind: 'fruit',
    season: { from: 5, to: 7 }
  },
  {
    name: 'Esskastanien',
    aliases: ['Maronen', 'Marone', 'Maroni', 'Kastanien', 'Chestnuts', 'Sweet chestnuts', 'Hạt dẻ'],
    kind: 'fruit',
    season: { from: 10, to: 12 }
  },
  { name: 'Feigen', aliases: ['Feige', 'Figs', 'Fig'], kind: 'fruit', season: { from: 9, to: 10 } },
  {
    name: 'Feldsalat',
    aliases: ['Rapunzel', 'Ackersalat', "Lamb's lettuce", 'Corn salad'],
    kind: 'vegetable',
    season: { from: 10, to: 3 }
  },
  { name: 'Fenchel', aliases: ['Gemüsefenchel', 'Fennel'], kind: 'vegetable', season: { from: 6, to: 11 } },
  {
    name: 'Frühlingszwiebeln',
    aliases: ['Frühlingszwiebel', 'Lauchzwiebeln', 'Spring onions', 'Scallions', 'Green onions', 'Hành lá'],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  {
    name: 'Granatäpfel',
    aliases: ['Pomegranate', 'Pomegranates', 'Lựu'],
    kind: 'fruit',
    season: { from: 10, to: 1 }
  },
  { name: 'Grünkohl', aliases: ['Braunkohl', 'Urkohl', 'Kale'], kind: 'vegetable', season: { from: 10, to: 3 } },
  {
    name: 'Gurken',
    aliases: ['Gurke', 'Salatgurke', 'Salatgurken', 'Einlegegurken', 'Cucumber', 'Cucumbers'],
    kind: 'vegetable',
    season: { from: 4, to: 10 }
  },
  {
    name: 'Heidelbeeren',
    aliases: ['Heidelbeere', 'Blaubeeren', 'Blueberries', 'Blueberry'],
    kind: 'fruit',
    season: { from: 7, to: 8 }
  },
  { name: 'Himbeeren', aliases: ['Himbeere', 'Raspberries', 'Raspberry'], kind: 'fruit', season: { from: 6, to: 8 } },
  {
    name: 'Holunderbeeren',
    aliases: ['Holunder', 'Elderberries', 'Elderberry'],
    kind: 'fruit',
    season: { from: 8, to: 9 }
  },
  {
    name: 'Johannisbeeren',
    aliases: ['Johannisbeere', 'Ribisel', 'Currants', 'Redcurrants', 'Blackcurrants'],
    kind: 'fruit',
    season: { from: 6, to: 8 }
  },
  {
    name: 'Kakis',
    aliases: ['Kaki', 'Sharonfrucht', 'Persimmon', 'Persimmons'],
    kind: 'fruit',
    season: { from: 10, to: 12 }
  },
  {
    name: 'Kirschen',
    aliases: ['Kirsch', 'Kirsche', 'Süßkirschen', 'Cherries', 'Cherry', 'Sweet cherries'],
    kind: 'fruit',
    season: { from: 6, to: 8 }
  },
  {
    name: 'Knollensellerie',
    aliases: ['Sellerie', 'Celeriac', 'Celery root'],
    kind: 'vegetable',
    season: { from: 6, to: 3 }
  },
  { name: 'Kohlrabi', aliases: ['Su hào', 'Turnip cabbage'], kind: 'vegetable', season: { from: 5, to: 11 } },
  {
    name: 'Kopfsalat',
    aliases: ['Butterhead lettuce', 'Lettuce'],
    kind: 'vegetable',
    season: { from: 4, to: 10 }
  },
  {
    name: 'Kürbis',
    aliases: ['Kürbisse', 'Hokkaido Kürbis', 'Hokkaido', 'Butternut', 'Pumpkin', 'Squash', 'Bí đỏ'],
    kind: 'vegetable',
    season: { from: 7, to: 12 }
  },
  { name: 'Lauch', aliases: ['Porree', 'Leek', 'Leeks'], kind: 'vegetable', season: { from: 9, to: 3 } },
  { name: 'Litschis', aliases: ['Litschi', 'Lychee', 'Lychees'], kind: 'fruit', season: { from: 11, to: 2 } },
  {
    name: 'Lollo Bionda',
    aliases: ['Lollo bionda letuce', 'Lollo bionda lettuce', 'Lollo Rosso', 'Lollo'],
    kind: 'vegetable',
    season: { from: 4, to: 11 }
  },
  {
    name: 'Mandarinen',
    aliases: ['Mandarine', 'Mandarines', 'Clementinen', 'Clementine', 'Mandarins', 'Clementines', 'Tangerines', 'Quýt'],
    kind: 'fruit',
    season: { from: 11, to: 2 }
  },
  { name: 'Mangold', aliases: ['Swiss chard', 'Chard'], kind: 'vegetable', season: { from: 5, to: 10 } },
  {
    name: 'Melonen',
    aliases: ['Zuckermelonen', 'Honigmelone', 'Galiamelone', 'Cantaloupe', 'Melon', 'Melons'],
    kind: 'fruit',
    season: { from: 6, to: 9 }
  },
  {
    name: 'Mirabellen',
    aliases: ['Mirabelle', 'Renekloden', 'Reineclauden', 'Mirabelle plums'],
    kind: 'fruit',
    season: { from: 7, to: 9 }
  },
  {
    name: 'Orangen',
    aliases: ['Orange', 'Apfelsinen', 'Oranges', 'Cam'],
    kind: 'fruit',
    season: { from: 11, to: 4 }
  },
  {
    name: 'Pak Choi',
    aliases: ['Pakchoi', 'Pak Choy', 'Bok choy', 'Cải thìa'],
    kind: 'vegetable',
    season: { from: 10, to: 12 }
  },
  {
    name: 'Paprika',
    aliases: ['Gemüsepaprika', 'Bell pepper', 'Bell peppers', 'Sweet pepper'],
    kind: 'vegetable',
    season: { from: 6, to: 10 }
  },
  { name: 'Pastinaken', aliases: ['Pastinake', 'Parsnip', 'Parsnips'], kind: 'vegetable', season: { from: 10, to: 3 } },
  {
    name: 'Petersilienwurzel',
    aliases: ['Wurzelpetersilie', 'Parsley root'],
    kind: 'vegetable',
    season: { from: 10, to: 3 }
  },
  {
    name: 'Pfirsiche',
    aliases: [
      'Pfirsich',
      'Nektarinen',
      'Nektarine',
      'Plattpfirsich',
      'Plattpfirsiche',
      'Peaches',
      'Peach',
      'Nectarines',
      'Flat peaches',
      'Đào'
    ],
    kind: 'fruit',
    season: { from: 7, to: 9 }
  },
  {
    name: 'Pflaumen',
    aliases: ['Pflaume', 'Zwetschgen', 'Zwetschen', 'Zwetschge', 'Plums', 'Plum', 'Mận'],
    kind: 'fruit',
    season: { from: 8, to: 9 }
  },
  { name: 'Preiselbeeren', aliases: ['Lingonberries'], kind: 'fruit', season: { from: 8, to: 10 } },
  { name: 'Quitten', aliases: ['Quitte', 'Quince', 'Quinces'], kind: 'fruit', season: { from: 10, to: 11 } },
  { name: 'Radicchio', aliases: ['Red chicory'], kind: 'vegetable', season: { from: 6, to: 11 } },
  { name: 'Radieschen', aliases: ['Radishes', 'Radish'], kind: 'vegetable', season: { from: 4, to: 10 } },
  { name: 'Rettich', aliases: ['Radi', 'White radish', 'Daikon'], kind: 'vegetable', season: { from: 5, to: 11 } },
  { name: 'Rhabarber', aliases: ['Rhubarb'], kind: 'vegetable', season: { from: 3, to: 6 } },
  {
    name: 'Romanasalat',
    aliases: ['Romana', 'Römersalat', 'Romaine lettuce', 'Romaine'],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  { name: 'Rosenkohl', aliases: ['Brussels sprouts'], kind: 'vegetable', season: { from: 10, to: 2 } },
  {
    name: 'Rote Bete',
    aliases: ['Rote Rüben', 'Rote Beete', 'Beetroot', 'Beets'],
    kind: 'vegetable',
    season: { from: 7, to: 3 }
  },
  { name: 'Rotkohl', aliases: ['Blaukraut', 'Rotkraut', 'Red cabbage'], kind: 'vegetable', season: { from: 5, to: 3 } },
  { name: 'Rucola', aliases: ['Rauke', 'Arugula', 'Rocket'], kind: 'vegetable', season: { from: 3, to: 11 } },
  {
    name: 'Sauerkirschen',
    aliases: ['Sauerkirsche', 'Weichseln', 'Sour cherries'],
    kind: 'fruit',
    season: { from: 7, to: 8 }
  },
  {
    name: 'Schwarzwurzeln',
    aliases: ['Schwarzwurzel', 'Salsify', 'Black salsify'],
    kind: 'vegetable',
    season: { from: 9, to: 3 }
  },
  {
    name: 'Spargel',
    aliases: ['Weißer Spargel', 'Grüner Spargel', 'Asparagus'],
    kind: 'vegetable',
    season: { from: 4, to: 6 }
  },
  { name: 'Spinat', aliases: ['Blattspinat', 'Spinach'], kind: 'vegetable', season: { from: 4, to: 11 } },
  {
    name: 'Spitzkohl',
    aliases: ['Pointed cabbage', 'Hispi cabbage'],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  { name: 'Stachelbeeren', aliases: ['Stachelbeere', 'Gooseberries'], kind: 'fruit', season: { from: 6, to: 8 } },
  {
    name: 'Stangensellerie',
    aliases: ['Staudensellerie', 'Bleichsellerie', 'Celery'],
    kind: 'vegetable',
    season: { from: 6, to: 11 }
  },
  {
    name: 'Steckrüben',
    aliases: ['Steckrübe', 'Kohlrüben', 'Swede', 'Rutabaga'],
    kind: 'vegetable',
    season: { from: 9, to: 3 }
  },
  {
    name: 'Tomaten',
    aliases: ['Tomate', 'Tomato', 'Tomatoes', 'Cherrytomaten', 'Cherry tomatoes', 'Kirschtomaten', 'Strauchtomaten'],
    kind: 'vegetable',
    season: { from: 5, to: 10 }
  },
  {
    name: 'Topinambur',
    aliases: ['Jerusalem artichoke', 'Sunchoke'],
    kind: 'vegetable',
    season: { from: 10, to: 3 }
  },
  {
    name: 'Wassermelonen',
    aliases: ['Wassermelone', 'Wassermelon', 'Watermelon', 'Dưa hấu'],
    kind: 'fruit',
    season: { from: 6, to: 9 }
  },
  {
    name: 'Weintrauben',
    aliases: ['Weintraube', 'Trauben', 'Tafeltrauben', 'Grapes', 'Nho'],
    kind: 'fruit',
    season: { from: 9, to: 10 }
  },
  {
    name: 'Weißkohl',
    aliases: ['Weißkraut', 'White cabbage'],
    kind: 'vegetable',
    season: { from: 5, to: 3 }
  },
  { name: 'Wirsing', aliases: ['Wirsingkohl', 'Savoy cabbage'], kind: 'vegetable', season: { from: 7, to: 2 } },
  {
    name: 'Zucchini',
    aliases: ['Zucchetti', 'Courgette', 'Courgettes'],
    kind: 'vegetable',
    season: { from: 6, to: 10 }
  },
  {
    name: 'Zuckermais',
    aliases: ['Mais', 'Maiskolben', 'Sweet corn', 'Corn on the cob', 'Bắp ngô', 'Ngô'],
    kind: 'vegetable',
    season: { from: 8, to: 10 }
  },
  {
    name: 'Zuckerschoten',
    aliases: ['Zuckererbsen', 'Kaiserschoten', 'Snow peas', 'Sugar snap peas'],
    kind: 'vegetable',
    season: { from: 6, to: 9 }
  }
];
