/**
 * The mobile wire shape as the OPENAPI DOCUMENT declares it.
 *
 * `mobile-transactions.test.ts` pins what the handlers actually serve. This
 * pins the other half, and it is the half that ships: the iOS client is
 * generated from this document, so a field added, renamed or made optional
 * here is a change to a shipped app's source. The build breaking is the good
 * outcome — but only for a change somebody meant to make, which is what these
 * exact-match assertions are for.
 *
 * The two files can disagree, and that disagreement is worth catching. A field
 * added to a contract schema but never emitted by a handler passes the runtime
 * assertions and still lands in the Swift client as a non-optional the server
 * never sends.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

const LIST_PATH = '/mobile/finance/transactions';
const DETAIL_PATH = '/mobile/finance/transactions/{id}';
const BOOTSTRAP_PATH = '/mobile/bootstrap';

interface JsonSchema {
  type?: string;
  enum?: unknown[];
  nullable?: boolean;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}

type OpenApiBody = {
  paths?: Record<
    string,
    | Record<
        string,
        { responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }> }
      >
    | undefined
  >;
};

/**
 * The document is static — it is read from disk once at module load and served
 * verbatim — so it is fetched once for the whole file rather than per
 * assertion. Standing up an app and a server per `it` would be a dozen
 * throwaway loopback listeners to read one unchanging file.
 */
let document: OpenApiBody;
let testApp: TestApp;

beforeAll(async () => {
  testApp = createTestApp();
  const res = await requestOn(testApp.app, (r) => r.get('/openapi'));
  expect(res.status).toBe(200);
  document = res.body as OpenApiBody;
});

afterAll(() => {
  testApp.cleanup();
});

function okSchema(path: string): JsonSchema {
  const schema =
    document.paths?.[path]?.['get']?.responses?.['200']?.content?.['application/json']?.schema;
  expect(schema).toBeDefined();
  if (schema === undefined) throw new Error(`no 200 schema for GET ${path}`);
  return schema;
}

/**
 * The declared field names, sorted. Read from `properties` rather than
 * `required` so a field that became optional shows up as still present — the
 * two are asserted separately below, because optionality is its own breaking
 * change in Swift.
 */
function fieldNames(schema: JsonSchema): string[] {
  return Object.keys(schema.properties ?? {}).toSorted();
}

const LIST_ROW_FIELDS = [
  'amount',
  'currency',
  'date',
  'description',
  'entityName',
  'id',
  'tags',
  'type',
];

const DETAIL_ONLY_FIELDS = [
  'account',
  'country',
  'entityId',
  'lastEditedTime',
  'location',
  'notes',
  'relatedTransactionId',
];

describe('the list page envelope', () => {
  it('declares exactly data and nextCursor', () => {
    const schema = okSchema(LIST_PATH);

    expect(fieldNames(schema)).toEqual(['data', 'nextCursor']);
    expect(schema.required?.toSorted()).toEqual(['data', 'nextCursor']);
  });

  it('declares nextCursor nullable, so the app has a terminating case to handle', () => {
    const schema = okSchema(LIST_PATH);

    expect(schema.properties?.['nextCursor']?.nullable).toBe(true);
  });
});

describe('the list row', () => {
  it('declares exactly the fields a list row renders', () => {
    const schema = okSchema(LIST_PATH);

    expect(fieldNames(schema.properties?.['data']?.items ?? {})).toEqual(LIST_ROW_FIELDS);
  });

  it('requires every one of them, so none arrives as an optional in Swift', () => {
    const schema = okSchema(LIST_PATH);

    expect(schema.properties?.['data']?.items?.required?.toSorted()).toEqual(LIST_ROW_FIELDS);
  });

  it('leaves the currency an open string, so a second currency still renders', () => {
    // Not a `type`/`literal` pin: this field sits inside every array element
    // of a page a build already on a phone still calls. An `enum` here
    // becomes a closed Swift enum, and the day bfm emits a currency besides
    // `MOBILE_CURRENCY`, every such build fails to decode the whole page —
    // one bad value, not just the row it is on.
    const schema = okSchema(LIST_PATH);

    const currency = schema.properties?.['data']?.items?.properties?.['currency'];
    expect(currency?.type).toBe('string');
    expect(currency?.enum).toBeUndefined();
  });

  it('leaves the transaction type an open string, so a new finance type still renders', () => {
    const schema = okSchema(LIST_PATH);

    const type = schema.properties?.['data']?.items?.properties?.['type'];
    expect(type?.type).toBe('string');
    expect(type?.enum).toBeUndefined();
  });

  it('declares amount a plain number — decimal dollars, signed, as finance publishes it', () => {
    const schema = okSchema(LIST_PATH);

    const amount = schema.properties?.['data']?.items?.properties?.['amount'];
    expect(amount?.type).toBe('number');
    expect(amount?.nullable).toBeUndefined();
  });
});

describe('the bootstrap feature id', () => {
  it('leaves the feature id an open string, so a second feature still decodes', () => {
    // Same hazard as currency/type above, sharper here: this field sits
    // inside every element of `features` on the app's first authenticated
    // call. An `enum` here becomes a closed Swift enum, and the day bfm adds
    // a feature besides `transactions`, every build already on a handset
    // fails to decode the WHOLE bootstrap payload, not just the row carrying
    // it — a phone that cannot get past its splash screen.
    const schema = okSchema(BOOTSTRAP_PATH);

    const id = schema.properties?.['features']?.items?.properties?.['id'];
    expect(id?.type).toBe('string');
    expect(id?.enum).toBeUndefined();
  });
});

describe('the detail record', () => {
  it('is the list row plus exactly the fields the detail screen adds', () => {
    const schema = okSchema(DETAIL_PATH);

    expect(fieldNames(schema)).toEqual([...LIST_ROW_FIELDS, ...DETAIL_ONLY_FIELDS].toSorted());
  });

  it('requires all of them', () => {
    const schema = okSchema(DETAIL_PATH);

    expect(schema.required?.toSorted()).toEqual(
      [...LIST_ROW_FIELDS, ...DETAIL_ONLY_FIELDS].toSorted()
    );
  });

  it('never contradicts the list row on a field they share', () => {
    // A rename or a type change applied to one and not the other would give
    // the app two incompatible models of the same transaction.
    const list = okSchema(LIST_PATH);
    const detail = okSchema(DETAIL_PATH);

    const row = list.properties?.['data']?.items?.properties ?? {};
    for (const field of LIST_ROW_FIELDS) {
      expect(detail.properties?.[field]).toEqual(row[field]);
    }
  });
});
