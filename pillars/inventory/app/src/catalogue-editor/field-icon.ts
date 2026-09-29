/** Reads a field's optional icon name without interpreting other presentation hints. */
export function fieldIconFromPresentation(
  presentation: Readonly<Record<string, unknown>> | undefined
): string | undefined {
  return typeof presentation?.icon === 'string' && presentation.icon !== ''
    ? presentation.icon
    : undefined;
}

/** Sets or clears the icon while preserving unrelated and future presentation hints. */
export function presentationWithIcon(
  presentation: Readonly<Record<string, unknown>>,
  icon: string
): Record<string, unknown> {
  const base = Object.fromEntries(Object.entries(presentation).filter(([key]) => key !== 'icon'));
  return icon === '' ? base : { ...base, icon };
}
