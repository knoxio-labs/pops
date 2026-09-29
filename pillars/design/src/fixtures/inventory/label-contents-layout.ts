/** Fictional inventory item names used to judge density and wrapping on a printed label. */
export const labelContents = [
  'A Field Guide to Quiet Machines',
  'Atlas of Borrowed Rooms',
  'Clouds Over Bellwether Bay',
  'Domestic Cartography',
  'Everyday Astronomy',
  'Gardens at the Edge of Winter',
  'How We Measure the Sea',
  'Ink, Paper, Thread',
  'Lanterns for the Long Crossing',
  'Notes from a Temporary Library',
  'Objects in the Rear-View Mirror',
  'Practical Mythologies for Small Apartments',
  'Seven Maps of an Imaginary Coastline',
  'The Archive of Unfinished Weather',
  'The Care and Feeding of Houseplants',
  'The Extremely Patient Book of Tides and Other Repeating Things',
  'Useful Knots for Unlikely Situations',
  'Ways of Looking at an Empty Shelf',
] as const;

/** A short contents list demonstrating when a single column remains easier to scan. */
export const shortLabelContents = labelContents.slice(0, 4);
