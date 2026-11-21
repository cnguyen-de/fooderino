import type { CalendarEntry } from '~~/types/season';

export const SEASON_CALENDAR: readonly CalendarEntry[] = [
  { name: 'Äpfel', aliases: ['Apple', 'Apples', 'Táo'], kind: 'fruit', season: { from: 8, to: 3 } },
  {
    name: 'Aprikosen',
    aliases: ['Aprikose', 'Marillen', 'Apricot', 'Apricots', 'Marille', 'Mơ'],
    kind: 'fruit',
    season: { from: 7, to: 8 }
  },
  {
    name: 'Auberginen',
    aliases: ['Aubergine', 'Melanzani', 'Eggplant', 'Aubergines', 'Eggplants', 'Melanzane', 'Cà tím'],
    kind: 'vegetable',
    season: { from: 7, to: 10 }
  },
  { name: 'Bärlauch', aliases: ['Wild garlic', 'Ramsons', 'Tỏi gấu'], kind: 'vegetable', season: { from: 3, to: 4 } },
  { name: 'Birnen', aliases: ['Birne', 'Pear', 'Pears', 'Lê'], kind: 'fruit', season: { from: 8, to: 2 } },
  {
    name: 'Blumenkohl',
    aliases: ['Cauliflower', 'Karfiol', 'Cauliflowers', 'Súp lơ trắng', 'Bông cải trắng'],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  {
    name: 'Bohnen',
    aliases: [
      'Grüne Bohnen',
      'Buschbohnen',
      'Stangenbohnen',
      'Prinzessbohnen',
      'Green beans',
      'French beans',
      'Bohne',
      'Grüne Bohne',
      'Brechbohnen',
      'Green bean',
      'String beans',
      'Haricots verts',
      'Đậu cô ve',
      'Đậu que'
    ],
    kind: 'vegetable',
    season: { from: 6, to: 10 }
  },
  {
    name: 'Brokkoli',
    aliases: ['Broccoli', 'Súp lơ xanh', 'Bông cải xanh'],
    kind: 'vegetable',
    season: { from: 6, to: 11 }
  },
  {
    name: 'Brombeeren',
    aliases: ['Brombeere', 'Blackberries', 'Blackberry', 'Mâm xôi đen'],
    kind: 'fruit',
    season: { from: 7, to: 9 }
  },
  {
    name: 'Chinakohl',
    aliases: ['Napa cabbage', 'Chinese cabbage', 'Cải thảo', 'Pekingkohl', 'Chinese leaf', 'Napa'],
    kind: 'vegetable',
    season: { from: 5, to: 2 }
  },
  {
    name: 'Dicke Bohnen',
    aliases: [
      'Saubohnen',
      'Ackerbohnen',
      'Broad beans',
      'Fava beans',
      'Dicke Bohne',
      'Saubohne',
      'Ackerbohne',
      'Puffbohnen',
      'Broad bean',
      'Fava bean',
      'Đậu tằm'
    ],
    kind: 'vegetable',
    season: { from: 6, to: 8 }
  },
  {
    name: 'Eisbergsalat',
    aliases: ['Eisberg', 'Iceberg lettuce', 'Eissalat', 'Iceberg', 'Xà lách Mỹ'],
    kind: 'vegetable',
    season: { from: 5, to: 10 }
  },
  {
    name: 'Endiviensalat',
    aliases: ['Endivie', 'Endivien', 'Frisée', 'Escariol', 'Endive', 'Escarole'],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  {
    name: 'Erbsen',
    aliases: ['Erbse', 'Peas', 'Green peas', 'Pea', 'Green pea', 'Đậu Hà Lan'],
    kind: 'vegetable',
    season: { from: 6, to: 9 }
  },
  {
    name: 'Erdbeeren',
    aliases: ['Erdbeer', 'Erdbeere', 'Strawberries', 'Strawberry', 'Dâu tây'],
    kind: 'fruit',
    season: { from: 5, to: 7 }
  },
  {
    name: 'Esskastanien',
    aliases: [
      'Maronen',
      'Marone',
      'Maroni',
      'Kastanien',
      'Chestnuts',
      'Sweet chestnuts',
      'Hạt dẻ',
      'Esskastanie',
      'Edelkastanien',
      'Kastanie',
      'Chestnut'
    ],
    kind: 'fruit',
    season: { from: 10, to: 12 }
  },
  { name: 'Feigen', aliases: ['Feige', 'Figs', 'Fig', 'Sung'], kind: 'fruit', season: { from: 9, to: 10 } },
  {
    name: 'Feldsalat',
    aliases: ['Rapunzel', 'Ackersalat', "Lamb's lettuce", 'Corn salad', 'Lambs lettuce', 'Mâche', 'Vogerlsalat'],
    kind: 'vegetable',
    season: { from: 10, to: 3 }
  },
  {
    name: 'Fenchel',
    aliases: ['Gemüsefenchel', 'Fennel', 'Fenchelknolle', 'Fennel bulb', 'Florence fennel'],
    kind: 'vegetable',
    season: { from: 6, to: 11 }
  },
  {
    name: 'Frühlingszwiebeln',
    aliases: [
      'Frühlingszwiebel',
      'Lauchzwiebeln',
      'Spring onions',
      'Scallions',
      'Green onions',
      'Hành lá',
      'Lauchzwiebel',
      'Spring onion',
      'Scallion',
      'Green onion',
      'Hành hoa'
    ],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  { name: 'Granatäpfel', aliases: ['Pomegranate', 'Pomegranates', 'Lựu'], kind: 'fruit', season: { from: 10, to: 1 } },
  {
    name: 'Grünkohl',
    aliases: ['Braunkohl', 'Urkohl', 'Kale', 'Federkohl', 'Curly kale', 'Cải xoăn'],
    kind: 'vegetable',
    season: { from: 10, to: 3 }
  },
  {
    name: 'Gurken',
    aliases: [
      'Gurke',
      'Salatgurke',
      'Salatgurken',
      'Einlegegurken',
      'Cucumber',
      'Cucumbers',
      'Einlegegurke',
      'Schlangengurke',
      'Schlangengurken',
      'Minigurken',
      'Dưa chuột',
      'Dưa leo'
    ],
    kind: 'vegetable',
    season: { from: 4, to: 10 }
  },
  {
    name: 'Heidelbeeren',
    aliases: ['Heidelbeere', 'Blaubeeren', 'Blueberries', 'Blueberry', 'Blaubeere', 'Việt quất'],
    kind: 'fruit',
    season: { from: 7, to: 8 }
  },
  {
    name: 'Himbeeren',
    aliases: ['Himbeere', 'Raspberries', 'Raspberry', 'Mâm xôi'],
    kind: 'fruit',
    season: { from: 6, to: 8 }
  },
  {
    name: 'Holunderbeeren',
    aliases: ['Holunder', 'Elderberries', 'Elderberry', 'Holunderbeere', 'Fliederbeeren'],
    kind: 'fruit',
    season: { from: 8, to: 9 }
  },
  {
    name: 'Johannisbeeren',
    aliases: [
      'Johannisbeere',
      'Ribisel',
      'Currants',
      'Redcurrants',
      'Blackcurrants',
      'Rote Johannisbeeren',
      'Schwarze Johannisbeeren',
      'Currant',
      'Redcurrant',
      'Blackcurrant',
      'Red currants',
      'Black currants',
      'Lý chua'
    ],
    kind: 'fruit',
    season: { from: 6, to: 8 }
  },
  {
    name: 'Kakis',
    aliases: ['Kaki', 'Sharonfrucht', 'Persimmon', 'Persimmons', 'Kakifrucht', 'Kakipflaume', 'Sharon fruit', 'Hồng'],
    kind: 'fruit',
    season: { from: 10, to: 12 }
  },
  {
    name: 'Kirschen',
    aliases: [
      'Kirsch',
      'Kirsche',
      'Süßkirschen',
      'Cherries',
      'Cherry',
      'Sweet cherries',
      'Süßkirsche',
      'Sweet cherry',
      'Anh đào'
    ],
    kind: 'fruit',
    season: { from: 6, to: 8 }
  },
  {
    name: 'Knollensellerie',
    aliases: ['Sellerie', 'Celeriac', 'Celery root', 'Selleriewurzel', 'Sellerieknolle'],
    kind: 'vegetable',
    season: { from: 6, to: 3 }
  },
  { name: 'Kohlrabi', aliases: ['Su hào', 'Turnip cabbage'], kind: 'vegetable', season: { from: 5, to: 11 } },
  {
    name: 'Kopfsalat',
    aliases: ['Butterhead lettuce', 'Lettuce', 'Buttersalat', 'Butter lettuce', 'Xà lách'],
    kind: 'vegetable',
    season: { from: 4, to: 10 }
  },
  {
    name: 'Kürbis',
    aliases: [
      'Kürbisse',
      'Hokkaido Kürbis',
      'Hokkaido',
      'Butternut',
      'Pumpkin',
      'Squash',
      'Bí đỏ',
      'Hokkaidokürbis',
      'Butternutkürbis',
      'Butternut squash',
      'Pumpkins',
      'Bí ngô'
    ],
    kind: 'vegetable',
    season: { from: 7, to: 12 }
  },
  {
    name: 'Lauch',
    aliases: ['Porree', 'Leek', 'Leeks', 'Lauchstange', 'Lauchstangen', 'Breitlauch', 'Tỏi tây'],
    kind: 'vegetable',
    season: { from: 9, to: 3 }
  },
  {
    name: 'Litschis',
    aliases: ['Litschi', 'Lychee', 'Lychees', 'Litchi', 'Litchis', 'Vải'],
    kind: 'fruit',
    season: { from: 11, to: 2 }
  },
  {
    name: 'Lollo Bionda',
    aliases: ['Lollo bionda letuce', 'Lollo bionda lettuce', 'Lollo Rosso', 'Lollo'],
    kind: 'vegetable',
    season: { from: 4, to: 11 }
  },
  {
    name: 'Mandarinen',
    aliases: [
      'Mandarine',
      'Mandarines',
      'Clementinen',
      'Clementine',
      'Mandarins',
      'Clementines',
      'Tangerines',
      'Quýt',
      'Satsuma',
      'Satsumas',
      'Mandarin',
      'Tangerine'
    ],
    kind: 'fruit',
    season: { from: 11, to: 2 }
  },
  {
    name: 'Mangold',
    aliases: ['Swiss chard', 'Chard', 'Rainbow chard', 'Cải cầu vồng'],
    kind: 'vegetable',
    season: { from: 5, to: 10 }
  },
  {
    name: 'Melonen',
    aliases: [
      'Zuckermelonen',
      'Honigmelone',
      'Galiamelone',
      'Cantaloupe',
      'Melon',
      'Melons',
      'Melone',
      'Zuckermelone',
      'Honigmelonen',
      'Galia',
      'Honeydew',
      'Honeydew melon',
      'Dưa lưới',
      'Dưa vàng'
    ],
    kind: 'fruit',
    season: { from: 6, to: 9 }
  },
  {
    name: 'Mirabellen',
    aliases: [
      'Mirabelle',
      'Renekloden',
      'Reineclauden',
      'Mirabelle plums',
      'Reneklode',
      'Reineclaude',
      'Ringlotten',
      'Mirabelle plum',
      'Greengage',
      'Greengages'
    ],
    kind: 'fruit',
    season: { from: 7, to: 9 }
  },
  {
    name: 'Orangen',
    aliases: [
      'Orange',
      'Apfelsinen',
      'Oranges',
      'Cam',
      'Apfelsine',
      'Blutorange',
      'Blutorangen',
      'Blood orange',
      'Blood oranges'
    ],
    kind: 'fruit',
    season: { from: 11, to: 4 }
  },
  {
    name: 'Pak Choi',
    aliases: [
      'Pakchoi',
      'Pak Choy',
      'Bok choy',
      'Cải thìa',
      'Pak-Choi',
      'Pok Choi',
      'Bok choi',
      'Senfkohl',
      'Cải chíp'
    ],
    kind: 'vegetable',
    season: { from: 10, to: 12 }
  },
  {
    name: 'Paprika',
    aliases: [
      'Gemüsepaprika',
      'Bell pepper',
      'Bell peppers',
      'Sweet pepper',
      'Paprikaschote',
      'Paprikaschoten',
      'Spitzpaprika',
      'Rote Paprika',
      'Gelbe Paprika',
      'Grüne Paprika',
      'Sweet peppers',
      'Capsicum',
      'Red bell pepper',
      'Yellow bell pepper',
      'Green bell pepper',
      'Ớt chuông'
    ],
    kind: 'vegetable',
    season: { from: 6, to: 10 }
  },
  {
    name: 'Pastinaken',
    aliases: ['Pastinake', 'Parsnip', 'Parsnips', 'Củ cải vàng'],
    kind: 'vegetable',
    season: { from: 10, to: 3 }
  },
  {
    name: 'Petersilienwurzel',
    aliases: ['Wurzelpetersilie', 'Parsley root', 'Petersilienwurzeln', 'Parsley roots', 'Hamburg parsley'],
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
      'Đào',
      'Nectarine',
      'Flat peach',
      'Donut peaches',
      'Weinbergpfirsiche',
      'Xuân đào'
    ],
    kind: 'fruit',
    season: { from: 7, to: 9 }
  },
  {
    name: 'Pflaumen',
    aliases: [
      'Pflaume',
      'Zwetschgen',
      'Zwetschen',
      'Zwetschge',
      'Plums',
      'Plum',
      'Mận',
      'Zwetsche',
      'Zwetschke',
      'Zwetschken'
    ],
    kind: 'fruit',
    season: { from: 8, to: 9 }
  },
  {
    name: 'Preiselbeeren',
    aliases: ['Lingonberries', 'Preiselbeere', 'Lingonberry', 'Cowberries'],
    kind: 'fruit',
    season: { from: 8, to: 10 }
  },
  { name: 'Quitten', aliases: ['Quitte', 'Quince', 'Quinces', 'Mộc qua'], kind: 'fruit', season: { from: 10, to: 11 } },
  { name: 'Radicchio', aliases: ['Red chicory', 'Radicchio rosso'], kind: 'vegetable', season: { from: 6, to: 11 } },
  { name: 'Radieschen', aliases: ['Radishes', 'Radish', 'Củ cải đỏ'], kind: 'vegetable', season: { from: 4, to: 10 } },
  {
    name: 'Rettich',
    aliases: ['Radi', 'White radish', 'Daikon', 'Weißer Rettich', 'Daikon radish', 'Mooli', 'Củ cải', 'Củ cải trắng'],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  { name: 'Rhabarber', aliases: ['Rhubarb', 'Đại hoàng'], kind: 'vegetable', season: { from: 3, to: 6 } },
  {
    name: 'Romanasalat',
    aliases: [
      'Romana',
      'Römersalat',
      'Romaine lettuce',
      'Romaine',
      'Romana Salat',
      'Romaine hearts',
      'Xà lách romaine'
    ],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  {
    name: 'Rosenkohl',
    aliases: ['Brussels sprouts', 'Kohlsprossen', 'Brussels sprout', 'Brussel sprouts', 'Bắp cải tí hon'],
    kind: 'vegetable',
    season: { from: 10, to: 2 }
  },
  {
    name: 'Rote Bete',
    aliases: ['Rote Rüben', 'Rote Beete', 'Beetroot', 'Beets', 'Rote Rübe', 'Randen', 'Beet', 'Củ dền'],
    kind: 'vegetable',
    season: { from: 7, to: 3 }
  },
  {
    name: 'Rotkohl',
    aliases: ['Blaukraut', 'Rotkraut', 'Red cabbage', 'Blaukohl', 'Purple cabbage', 'Bắp cải tím'],
    kind: 'vegetable',
    season: { from: 5, to: 3 }
  },
  {
    name: 'Rucola',
    aliases: ['Rauke', 'Arugula', 'Rocket', 'Rukola', 'Ruccola', 'Rocket salad'],
    kind: 'vegetable',
    season: { from: 3, to: 11 }
  },
  {
    name: 'Sauerkirschen',
    aliases: [
      'Sauerkirsche',
      'Weichseln',
      'Sour cherries',
      'Schattenmorellen',
      'Schattenmorelle',
      'Weichsel',
      'Sour cherry',
      'Anh đào chua'
    ],
    kind: 'fruit',
    season: { from: 7, to: 8 }
  },
  {
    name: 'Schwarzwurzeln',
    aliases: ['Schwarzwurzel', 'Salsify', 'Black salsify', 'Winterspargel', 'Scorzonera'],
    kind: 'vegetable',
    season: { from: 9, to: 3 }
  },
  {
    name: 'Spargel',
    aliases: [
      'Weißer Spargel',
      'Grüner Spargel',
      'Asparagus',
      'Grünspargel',
      'Bleichspargel',
      'White asparagus',
      'Green asparagus',
      'Măng tây'
    ],
    kind: 'vegetable',
    season: { from: 4, to: 6 }
  },
  {
    name: 'Spinat',
    aliases: ['Blattspinat', 'Spinach', 'Babyspinat', 'Baby spinach', 'Rau chân vịt', 'Cải bó xôi', 'Rau bina'],
    kind: 'vegetable',
    season: { from: 4, to: 11 }
  },
  {
    name: 'Spitzkohl',
    aliases: ['Pointed cabbage', 'Hispi cabbage', 'Spitzkraut', 'Sweetheart cabbage'],
    kind: 'vegetable',
    season: { from: 5, to: 11 }
  },
  {
    name: 'Stachelbeeren',
    aliases: ['Stachelbeere', 'Gooseberries', 'Gooseberry', 'Lý gai'],
    kind: 'fruit',
    season: { from: 6, to: 8 }
  },
  {
    name: 'Stangensellerie',
    aliases: [
      'Staudensellerie',
      'Bleichsellerie',
      'Celery',
      'Selleriestangen',
      'Celery sticks',
      'Celery stalks',
      'Cần tây'
    ],
    kind: 'vegetable',
    season: { from: 6, to: 11 }
  },
  {
    name: 'Steckrüben',
    aliases: ['Steckrübe', 'Kohlrüben', 'Swede', 'Rutabaga', 'Kohlrübe', 'Wruken', 'Swedes', 'Rutabagas'],
    kind: 'vegetable',
    season: { from: 9, to: 3 }
  },
  {
    name: 'Tomaten',
    aliases: [
      'Tomate',
      'Tomato',
      'Tomatoes',
      'Cherrytomaten',
      'Cherry tomatoes',
      'Kirschtomaten',
      'Strauchtomaten',
      'Cherrytomate',
      'Kirschtomate',
      'Strauchtomate',
      'Rispentomaten',
      'Rispentomate',
      'Fleischtomaten',
      'Fleischtomate',
      'Romatomaten',
      'Datteltomaten',
      'Cocktailtomaten',
      'Cherry tomato',
      'Cà chua',
      'Cà chua bi'
    ],
    kind: 'vegetable',
    season: { from: 5, to: 10 }
  },
  {
    name: 'Topinambur',
    aliases: ['Jerusalem artichoke', 'Sunchoke', 'Erdbirne', 'Jerusalem artichokes', 'Sunchokes'],
    kind: 'vegetable',
    season: { from: 10, to: 3 }
  },
  {
    name: 'Wassermelonen',
    aliases: ['Wassermelone', 'Wassermelon', 'Watermelon', 'Dưa hấu', 'Watermelons'],
    kind: 'fruit',
    season: { from: 6, to: 9 }
  },
  {
    name: 'Weintrauben',
    aliases: [
      'Weintraube',
      'Trauben',
      'Tafeltrauben',
      'Grapes',
      'Nho',
      'Traube',
      'Tafeltraube',
      'Grüne Trauben',
      'Rote Trauben',
      'Grape',
      'Green grapes',
      'Red grapes'
    ],
    kind: 'fruit',
    season: { from: 9, to: 10 }
  },
  {
    name: 'Weißkohl',
    aliases: [
      'Weißkraut',
      'White cabbage',
      'Weisskohl',
      'Weisskraut',
      'Cabbage',
      'Bắp cải',
      'Bắp cải trắng',
      'Cải bắp'
    ],
    kind: 'vegetable',
    season: { from: 5, to: 3 }
  },
  {
    name: 'Wirsing',
    aliases: ['Wirsingkohl', 'Savoy cabbage', 'Savoy'],
    kind: 'vegetable',
    season: { from: 7, to: 2 }
  },
  {
    name: 'Zucchini',
    aliases: ['Zucchetti', 'Courgette', 'Courgettes', 'Zucchinis', 'Courgetti', 'Bí ngòi'],
    kind: 'vegetable',
    season: { from: 6, to: 10 }
  },
  {
    name: 'Zuckermais',
    aliases: [
      'Mais',
      'Maiskolben',
      'Sweet corn',
      'Corn on the cob',
      'Bắp ngô',
      'Ngô',
      'Corn',
      'Sweetcorn',
      'Corn cobs',
      'Bắp',
      'Ngô ngọt',
      'Bắp Mỹ'
    ],
    kind: 'vegetable',
    season: { from: 8, to: 10 }
  },
  {
    name: 'Zuckerschoten',
    aliases: [
      'Zuckererbsen',
      'Kaiserschoten',
      'Snow peas',
      'Sugar snap peas',
      'Zuckerschote',
      'Mangetout',
      'Snow pea',
      'Sugar snaps'
    ],
    kind: 'vegetable',
    season: { from: 6, to: 9 }
  }
];
