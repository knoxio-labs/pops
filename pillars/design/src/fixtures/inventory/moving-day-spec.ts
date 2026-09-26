/**
 * The move-out as written down, one line per box: id, name, the place it
 * was packed in, open or closed (and full), its label code, where it is
 * going, and what is in it (`×n` is a quantity). Loose things are one line
 * per place. `moving-day.ts` parses this into a world.
 */

/** Where boxes are going: the storage unit or the parents' house. */
export const STORAGE = 'loc-storage';
export const PARENTS = 'loc-parents';

/** `id | name | packed in | access [full] | code or - | going to or - | contents`. */
export const BOX_LINES: readonly string[] = [
  'mv-k01 | Kitchen 01 | loc-kitchen | closed full | K01 | storage | Dinner plates ×8, Side plates ×8, Bowls ×6, Serving platter',
  'mv-k02 | Kitchen 02 | loc-kitchen | closed full | K02 | storage | Wine glasses ×6, Tumblers ×6, Mugs ×6',
  'mv-k03 | Kitchen 03 | loc-kitchen | open full | K03 | parents | Saucepans ×3, Frying pan, Colander, Baking trays ×2',
  "mv-k04 | Kitchen 04 | loc-kitchen | open | - | storage | Kettle, Toaster, Utensil crock, Chef's knife",
  'mv-l01 | Living 01 | loc-living | closed full | L01 | storage | Paperbacks ×24, Board games ×3, Photo albums ×4',
  'mv-l02 | Living 02 | loc-living | closed | L02 | parents | Photo frames ×5, Candle holders ×2, Throw cushions ×3',
  'mv-l03 | Living 03 | loc-living | open | L03 | storage | HDMI cables ×3, Game controllers ×2, Soundbar',
  'mv-s01 | Study 01 | loc-study | closed full | S01 | parents | Ring binders ×6, Warranty folder, Tax records 2019–2025',
  'mv-s02 | Study 02 | loc-study | closed full | - | storage | Monitor 27 in, Keyboard, Mouse, Desk lamp',
  'mv-s03 | Study 03 | loc-study | open | S03 | - | Printer paper, Label printer, Stationery tray',
  'mv-b01 | Bedroom 01 | loc-bedroom | closed full | B01 | parents | Winter jackets ×3, Jumpers ×6, Scarves ×4',
  'mv-b02 | Bedroom 02 | loc-bedroom | open full | B02 | storage | Spare sheets ×2, Doona, Pillows ×2',
  'mv-g01 | Garage 01 | loc-garage | closed full | G01 | storage | Cordless drill, Drill bit set, Orbital sander, Extension leads ×2',
  'mv-g02 | Garage 02 | loc-garage | closed | - | parents | Camping stove, Tent, Sleeping bags ×2',
  'mv-g03 | Garage 03 | loc-garage | open | G03 | storage | Garden shears, Hose fittings',
  'mv-t01 | Christmas tub | loc-storage-bay | closed full | T01 | storage | Baubles ×40, Fairy lights, Tree stand',
];

/** `place | things`: what is still loose there. */
export const LOOSE_LINES: readonly string[] = [
  'loc-kitchen | Blender, Stand mixer, Spice jars ×12, Cutting boards ×3, Rice cooker',
  'loc-pantry | Tinned tomatoes ×6',
  'loc-living | Television, Floor lamp, Record player, Vinyl records ×40',
  'loc-bookshelf | Cookbooks ×9',
  'loc-study | Office chair, Wi-Fi router',
  'loc-desk | Filing trays ×2',
  'loc-bedroom | Bedside lamps ×2, Mirror',
  'loc-wardrobe | Shoe boxes ×5',
  'loc-garage | Step ladder, Bicycle',
  'loc-shelving | Terracotta pots ×4',
  'loc-hall | Shoe rack',
  'loc-hall-cupboard | Stick vacuum',
];

/** Carried right now. */
export const IN_HAND_LINE = 'Tape measure, Packing tape ×2, Marker pens ×3';
