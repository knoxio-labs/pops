import { and, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { z } from 'zod';

import { resolveProtocol1TypeById } from '../../catalogue/index.js';
import { WebConnectionsResponseSchema } from '../../contract/rest-web-connections.js';
import { ValidationError } from '../shared/errors.js';
import { decodeCursor, encodeCursor } from '../sync/cursor.js';

import type { CommandDb } from '../../domain/commands/index.js';

type WebConnectionsResponse = z.infer<typeof WebConnectionsResponseSchema>;
type ConnectionRow = WebConnectionsResponse['rows'][number];
type ConnectionSummary = WebConnectionsResponse['summary'];
type RawItemEnd = Pick<ConnectionRow['item'], 'id' | 'name' | 'code' | 'lifecycle'> & {
  typeId: string | null;
  isContainer: number;
};
type RawConnectionRow = Record<
  'row_id' | 'created_at' | 'item_id' | 'item_name' | 'item_lifecycle' | 'far_id' | 'far_name',
  string
> &
  Record<
    | 'item_code'
    | 'item_type_id'
    | 'far_code'
    | 'far_type_id'
    | 'far_lifecycle'
    | 'far_type'
    | 'far_location_id',
    string | null
  > & { item_is_container: number; far_kind: 'item' | 'fixture'; far_is_container: number | null };

const cursorSchema = z.object({
  v: z.literal(1),
  t: z.literal('web-connections'),
  kind: z.enum(['all', 'item', 'fixture']),
  q: z.string().nullable(),
  key: z.tuple([z.string(), z.string(), z.string()]),
});
type ConnectionsCursor = z.infer<typeof cursorSchema>;
type PageRequest = {
  kind: ConnectionsCursor['kind'];
  query: string;
  cursor: ConnectionsCursor | null;
  limit: number;
};

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/gu, (character) => `\\${character}`);

function like(expression: SQLWrapper, pattern: string): SQL {
  return sql`lower(${expression}) LIKE lower(${pattern}) ESCAPE '\\'`;
}

function connectionRowsCte(): SQL {
  return sql.raw(
    `item_edges AS (SELECT ic.id,ic.created_at,a.id a_id,a.name a_name,a.code a_code,a.type_id a_type_id,a.is_container a_is_container,a.lifecycle a_lifecycle,b.id b_id,b.name b_name,b.code b_code,b.type_id b_type_id,b.is_container b_is_container,b.lifecycle b_lifecycle,CASE WHEN a.name COLLATE NOCASE < b.name COLLATE NOCASE OR (a.name COLLATE NOCASE = b.name COLLATE NOCASE AND a.id <= b.id) THEN 1 ELSE 0 END a_first FROM item_connections ic JOIN items a ON a.id=ic.item_a_id JOIN items b ON b.id=ic.item_b_id WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL),connection_rows AS (SELECT 'item:'||id row_id,created_at,CASE WHEN a_first=1 THEN a_id ELSE b_id END item_id,CASE WHEN a_first=1 THEN a_name ELSE b_name END item_name,CASE WHEN a_first=1 THEN a_code ELSE b_code END item_code,CASE WHEN a_first=1 THEN a_type_id ELSE b_type_id END item_type_id,CASE WHEN a_first=1 THEN a_is_container ELSE b_is_container END item_is_container,CASE WHEN a_first=1 THEN a_lifecycle ELSE b_lifecycle END item_lifecycle,'item' far_kind,CASE WHEN a_first=1 THEN b_id ELSE a_id END far_id,CASE WHEN a_first=1 THEN b_name ELSE a_name END far_name,CASE WHEN a_first=1 THEN b_code ELSE a_code END far_code,CASE WHEN a_first=1 THEN b_type_id ELSE a_type_id END far_type_id,CASE WHEN a_first=1 THEN b_is_container ELSE a_is_container END far_is_container,CASE WHEN a_first=1 THEN b_lifecycle ELSE a_lifecycle END far_lifecycle,NULL far_type,NULL far_location_id FROM item_edges UNION ALL SELECT 'fixture:'||ifc.id row_id,ifc.created_at,i.id item_id,i.name item_name,i.code item_code,i.type_id item_type_id,i.is_container item_is_container,i.lifecycle item_lifecycle,'fixture' far_kind,f.id far_id,f.name far_name,NULL far_code,NULL far_type_id,NULL far_is_container,NULL far_lifecycle,f.type far_type,f.location_id far_location_id FROM item_fixture_connections ifc JOIN items i ON i.id=ifc.item_id JOIN fixtures f ON f.id=ifc.fixture_id WHERE i.deleted_at IS NULL)`
  );
}

function cursorCondition(cursor: ConnectionsCursor | null): SQL | undefined {
  if (cursor === null) return undefined;
  const [itemName, farName, rowId] = cursor.key;
  return sql`(item_name COLLATE NOCASE > ${itemName} OR (item_name COLLATE NOCASE = ${itemName} AND (far_name COLLATE NOCASE > ${farName} OR (far_name COLLATE NOCASE = ${farName} AND row_id > ${rowId}))))`;
}

function filterCondition(
  kind: ConnectionsCursor['kind'],
  query: string,
  cursor: ConnectionsCursor | null
): SQL {
  const conditions: SQL[] = [];
  if (kind !== 'all') conditions.push(sql`far_kind = ${kind}`);
  if (query !== '') {
    const pattern = `%${escapeLike(query)}%`;
    const fields = [sql`item_name`, sql`item_code`, sql`far_name`, sql`far_code`];
    conditions.push(or(...fields.map((field) => like(field, pattern))) ?? sql`0`);
  }
  const after = cursorCondition(cursor);
  if (after !== undefined) conditions.push(after);
  return and(...conditions) ?? sql`1`;
}

function readPageRows(db: CommandDb, request: PageRequest): RawConnectionRow[] {
  const condition = filterCondition(request.kind, request.query, request.cursor);
  return db.all(sql<RawConnectionRow>`
    WITH ${connectionRowsCte()}, filtered AS (
      SELECT * FROM connection_rows WHERE ${condition}
    )
    SELECT * FROM filtered
    ORDER BY item_name COLLATE NOCASE, far_name COLLATE NOCASE, row_id
    LIMIT ${request.limit + 1}
  `);
}

function readSummary(
  db: CommandDb,
  request: Pick<PageRequest, 'kind' | 'query'>
): ConnectionSummary {
  const condition = filterCondition(request.kind, request.query, null);
  const [summary] = db.all(
    sql<ConnectionSummary>`WITH ${connectionRowsCte()}, filtered AS (SELECT item_id, far_kind, far_id FROM connection_rows WHERE ${condition}) SELECT COUNT(*) AS connections, (SELECT COUNT(*) FROM (SELECT item_id AS id FROM filtered UNION SELECT far_id AS id FROM filtered WHERE far_kind = 'item')) AS items, COUNT(DISTINCT CASE WHEN far_kind = 'fixture' THEN far_id END) AS fixtures FROM filtered`
  );
  return WebConnectionsResponseSchema.shape.summary.parse(
    summary ?? { connections: 0, items: 0, fixtures: 0 }
  );
}

function typeKeysFor(db: CommandDb, ends: readonly RawItemEnd[]): Map<string, string | null> {
  const keysByTypeId = new Map<string, string | null>();
  for (const end of ends) {
    if (end.typeId !== null && !keysByTypeId.has(end.typeId))
      keysByTypeId.set(end.typeId, resolveProtocol1TypeById(db, end.typeId)?.key ?? null);
  }
  return new Map(
    ends.map((end) => [end.id, end.typeId === null ? null : (keysByTypeId.get(end.typeId) ?? null)])
  );
}

function rawItemEnd(row: RawConnectionRow, far: boolean): RawItemEnd {
  const id = far ? row.far_id : row.item_id;
  const name = far ? row.far_name : row.item_name;
  const code = far ? row.far_code : row.item_code;
  const typeId = far ? row.far_type_id : row.item_type_id;
  const isContainer = far ? row.far_is_container : row.item_is_container;
  const lifecycle = far ? row.far_lifecycle : row.item_lifecycle;
  if (isContainer === null || lifecycle === null)
    throw new Error('fixture endpoints are not items');
  return {
    id,
    name,
    code,
    typeId,
    isContainer,
    lifecycle,
  };
}

function toItemEnd(
  end: RawItemEnd,
  typeKeys: ReadonlyMap<string, string | null>
): ConnectionRow['item'] {
  return {
    kind: 'item',
    id: end.id,
    name: end.name,
    code: end.code,
    typeKey: typeKeys.get(end.id) ?? null,
    isContainer: end.isContainer === 1,
    lifecycle: end.lifecycle,
  };
}

function rowsFromConnections(db: CommandDb, rows: readonly RawConnectionRow[]): ConnectionRow[] {
  const ends = rows.flatMap((row) => [
    rawItemEnd(row, false),
    ...(row.far_kind === 'item' ? [rawItemEnd(row, true)] : []),
  ]);
  const typeKeys = typeKeysFor(db, ends);
  return rows.map((row) => ({
    id: row.row_id,
    createdAt: row.created_at,
    item: toItemEnd(rawItemEnd(row, false), typeKeys),
    far:
      row.far_kind === 'item'
        ? toItemEnd(rawItemEnd(row, true), typeKeys)
        : {
            kind: 'fixture' as const,
            id: row.far_id,
            name: row.far_name,
            type: row.far_type ?? '',
            locationId: row.far_location_id,
          },
  }));
}

/** Read the resolved, filtered, cursor-paged web connection registry. */
export function readConnectionsPage(
  db: CommandDb,
  filter: { kind: 'all' | 'item' | 'fixture'; q?: string },
  request: { cursor?: string; limit: number }
): WebConnectionsResponse {
  const query = filter.q?.trim().toLowerCase() ?? '';
  const cursor = cursorFor(request.cursor, { kind: filter.kind, q: query === '' ? null : query });
  const rawRows = readPageRows(db, { kind: filter.kind, query, cursor, limit: request.limit });
  const pageRows = rawRows.slice(0, request.limit);
  const last = pageRows.at(-1);
  return {
    rows: rowsFromConnections(db, pageRows),
    nextCursor:
      rawRows.length > request.limit && last
        ? encodeCursor({
            v: 1,
            t: 'web-connections',
            kind: filter.kind,
            q: query === '' ? null : query,
            key: [last.item_name, last.far_name, last.row_id],
          })
        : null,
    summary: readSummary(db, { kind: filter.kind, query }),
  };
}

function cursorFor(
  raw: string | undefined,
  filter: { kind: ConnectionsCursor['kind']; q: string | null }
): ConnectionsCursor | null {
  if (raw === undefined) return null;
  try {
    const cursor = decodeCursor(cursorSchema, raw);
    if (cursor.kind !== filter.kind || cursor.q !== filter.q) throw new Error('cursor mismatch');
    return cursor;
  } catch {
    throw new ValidationError('The cursor was not issued by this route', { cursor: raw });
  }
}
