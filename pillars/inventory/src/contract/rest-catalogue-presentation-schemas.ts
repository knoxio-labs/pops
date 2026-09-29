import { z } from 'zod';

export const CatalogueIconTokenSchema = z.enum([
  'item',
  'book',
  'furniture',
  'textiles',
  'bedding',
  'pillows',
  'electronics',
  'cable',
  'tools',
  'kitchen',
  'bar',
  'containers',
  'art',
  'clothing',
  'outdoor',
  'plant',
  'cleaning',
  'document',
  'key',
]);

export const CatalogueTypePresentationSchema = z
  .record(z.string(), z.unknown())
  .superRefine((presentation, context) => {
    const icon = presentation.icon;
    if (icon !== undefined && !CatalogueIconTokenSchema.safeParse(icon).success) {
      context.addIssue({
        code: 'custom',
        path: ['icon'],
        message: 'icon must be a supported semantic catalogue icon token',
      });
    }
  });
