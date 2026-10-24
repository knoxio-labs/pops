/** Fictional place-picker records; route items store references, not repeated names. */
export interface TripPlace {
  id: string;
  name: string;
  kind: 'city' | 'region' | 'airport';
  code?: string;
}

/** Local picker vocabulary for the prototype; it does not query or cache a place provider. */
export const tripPlaces: TripPlace[] = [
  { id: 'sydney', name: 'Sydney', kind: 'city' },
  { id: 'sao-paulo', name: 'São Paulo', kind: 'city' },
  { id: 'curitiba', name: 'Curitiba', kind: 'city' },
  { id: 'porto-alegre', name: 'Porto Alegre', kind: 'city' },
  { id: 'recife-olinda', name: 'Recife / Olinda', kind: 'city' },
  { id: 'rio', name: 'Rio de Janeiro', kind: 'city' },
  { id: 'florianopolis', name: 'Florianópolis', kind: 'city' },
  { id: 'northeast', name: 'Northeast', kind: 'region' },
  { id: 'minas', name: 'Belo Horizonte / Minas', kind: 'region' },
  { id: 'es', name: 'Espírito Santo', kind: 'region' },
  { id: 'airport-syd', name: 'Sydney', code: 'SYD', kind: 'airport' },
  { id: 'airport-dfw', name: 'Dallas / Fort Worth', code: 'DFW', kind: 'airport' },
  { id: 'airport-gru', name: 'São Paulo / Guarulhos', code: 'GRU', kind: 'airport' },
  { id: 'airport-poa', name: 'Porto Alegre', code: 'POA', kind: 'airport' },
  { id: 'airport-rec', name: 'Recife', code: 'REC', kind: 'airport' },
  { id: 'airport-fln', name: 'Florianópolis', code: 'FLN', kind: 'airport' },
];

/** Resolve a selected place reference without inventing a missing location. */
export function tripPlaceName(id: string): string {
  return tripPlaces.find((place) => place.id === id)?.name ?? 'Location unavailable';
}

/** Format a selected airport code, falling back to the place name. */
export function tripPlaceCode(id: string): string {
  const place = tripPlaces.find((candidate) => candidate.id === id);
  return place?.code ?? tripPlaceName(id);
}
