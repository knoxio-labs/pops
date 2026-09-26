import { z } from 'zod';

/** A contributor credited on a book product returned by a source adapter. */
export const ProductContributorSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1).optional(),
});

/** The provider-independent book shape exposed by the barcode pillar. */
export const ProductSchema = z.object({
  code: z.string().min(1),
  kind: z.literal('book'),
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
  contributors: z.array(ProductContributorSchema),
  publisher: z.string().min(1).optional(),
  publishedDate: z.string().min(1).optional(),
  pageCount: z.number().int().positive().optional(),
  language: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  subjects: z.array(z.string()),
  imageUrls: z.array(z.string().url()),
  source: z.enum(['open_library', 'google_books']),
  fetchedAt: z.string().min(1),
  attributes: z.record(z.string(), z.string()),
});

/** Inferred type for the normalised book product wire shape. */
export type Product = z.infer<typeof ProductSchema>;
