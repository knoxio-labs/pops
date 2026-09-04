/**
 * Wire mapper for the institutions domain (POPS-2803). The zod schemas live
 * in the REST contract (`src/contract/rest-institutions.ts`); this file
 * keeps only the row → response projection and its TS shape.
 */
import type {
  CreateInstitutionInput,
  InstitutionRow,
  UpdateInstitutionInput,
} from '../../db/index.js';

/** API response shape (camelCase). */
export interface Institution {
  id: string;
  name: string;
  colour: string;
  logoAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Wire body accepted by `POST /institutions`. */
export interface CreateInstitutionBody {
  name: string;
  colour: string;
  logoAssetId?: string | null;
}

/** Wire body accepted by `PATCH /institutions/:id`. */
export interface UpdateInstitutionBody {
  name?: string;
  colour?: string;
}

/** Map a SQLite row to the API response shape. */
export function toInstitution(row: InstitutionRow): Institution {
  return {
    id: row.id,
    name: row.name,
    colour: row.colour,
    logoAssetId: row.logoAssetId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Map a create request body to the persistence layer's input shape. */
export function toCreateInstitutionInput(body: CreateInstitutionBody): CreateInstitutionInput {
  return {
    name: body.name,
    colour: body.colour,
    logoAssetId: body.logoAssetId ?? null,
  };
}

/** Map an update request body to the persistence layer's input shape. */
export function toUpdateInstitutionInput(body: UpdateInstitutionBody): UpdateInstitutionInput {
  return {
    name: body.name,
    colour: body.colour,
  };
}
