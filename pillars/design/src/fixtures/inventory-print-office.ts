/**
 * Office 04 and its 24 lines, the iOS container page's "many contents" box,
 * each line coded so the job is purely a question of how many labels.
 */
import { office04, printFixtureId } from './inventory-print';

import type { PrintSubject } from '@/kit/inventory/print/print-subject';

const officeLines: [name: string, quantity: number][] = [
  ['USB-A to USB-C cable', 1],
  ['Desk lamp', 1],
  ['Notebooks', 5],
  ['Monitor stand', 1],
  ['HDMI cable, 2 m', 2],
  ['Keyboard', 1],
  ['Mouse', 1],
  ['Headphones', 1],
  ['Webcam', 1],
  ['Power strip', 1],
  ['Pens', 12],
  ['Sticky notes', 4],
  ['Wi-Fi router', 1],
  ['Ethernet cable, 5 m', 3],
  ['Laptop stand', 1],
  ['Document tray', 2],
  ['Stapler', 1],
  ['External drive', 2],
  ['Microphone', 1],
  ['Desk mat', 1],
  ['Cable ties', 40],
  ['Phone charger', 2],
  ['Speaker', 1],
  ['Label printer', 1],
];

export const office04WithContents: PrintSubject[] = [
  office04,
  ...officeLines.map(([name, quantity], index): PrintSubject => ({
    id: printFixtureId(100 + index),
    name,
    code: `OFF-${String(index + 1).padStart(3, '0')}`,
    suggestedCode: null,
    kind: 'item',
    place: 'Office 04',
    quantity,
  })),
];
