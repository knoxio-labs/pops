# PRD-022: Paperless-ngx Integration

**Epic:** [04 — Paperless-ngx Integration](../themes/inventory/epics/04-paperless-integration.md)
**Theme:** Inventory
**Status:** Draft

## Problem Statement

Receipts, warranty cards, and user manuals live in Paperless-ngx — already OCR'd, tagged, and searchable. But there's no connection between a Paperless-ngx document and the inventory item it relates to. When a warranty claim requires proof of purchase, the user has to manually search Paperless-ngx. Linking documents to items closes this gap.

## Goal

From an item's detail page, search Paperless-ngx, link relevant documents (receipt, warranty, manual), and view them without leaving POPS. The link is a reference — POPS doesn't store the document, just points to it in Paperless-ngx.

## Requirements

### R1: Paperless-ngx API Client

Create `apps/pops-api/src/modules/inventory/paperless/`:

```
inventory/paperless/
  client.ts           (HTTP client for Paperless-ngx REST API)
  types.ts            (response types)
  service.ts          (search, fetch metadata, thumbnails)
  client.test.ts
```

**Paperless-ngx API basics:**
- Base URL: user-configured (e.g., `http://192.168.1.100:8000`)
- Authentication: `Authorization: Token {api_token}`
- REST API: `/api/documents/`, `/api/correspondents/`, `/api/tags/`

**Key endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/documents/` | GET | Search/list documents (supports full-text search) |
| `/api/documents/{id}/` | GET | Document metadata |
| `/api/documents/{id}/thumb/` | GET | Document thumbnail image |
| `/api/documents/{id}/download/` | GET | Download document file |
| `/api/documents/{id}/preview/` | GET | Document preview (PDF viewer) |

### R2: Item Documents Table

```typescript
export const itemDocuments = sqliteTable('item_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  paperlessDocumentId: integer('paperless_document_id').notNull(),
  documentType: text('document_type', { enum: ['receipt', 'warranty', 'manual', 'other'] }).notNull(),
  title: text('title'),
  linkedAt: text('linked_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_item_documents_item').on(table.itemId),
  unique().on(table.itemId, table.paperlessDocumentId),
]);
```

- One item can have multiple documents (receipt + warranty + manual)
- One Paperless document can link to multiple items (bulk purchase receipt)
- `title` cached from Paperless-ngx at link time (avoids API call on every detail page load)
- Unique constraint prevents linking the same document to the same item twice

### R3: Document Search and Linking

**On item detail page → Documents section:**

- "Link Document" button
- Opens search modal:
  - Search input → queries Paperless-ngx API (`/api/documents/?query={search}`)
  - Results show: document title, date, correspondent, tags, thumbnail
  - Document type selector: receipt, warranty, manual, other
  - "Link" button per result
- On link: `inventory.documents.link({ itemId, paperlessDocumentId, documentType, title })`
- Linked document appears immediately in the documents section
- Toast: "Linked [Document Title] as receipt"

### R4: Linked Documents Display

**On item detail page → Documents section:**

- List of linked documents grouped by type:
  - 📄 Receipts
  - 📋 Warranties
  - 📖 Manuals
  - 📎 Other
- Each document shows: title, date linked, thumbnail preview
- Click document → opens Paperless-ngx in a new tab (or inline PDF preview if feasible)
- "Unlink" action per document (removes the link, not the Paperless-ngx document)
- Download button → proxies the file download from Paperless-ngx

### R5: tRPC Router

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `inventory.documents.search` | query | `{ query: string }` | `PaperlessDocument[]` | Search Paperless-ngx documents |
| `inventory.documents.link` | mutation | `{ itemId, paperlessDocumentId, documentType, title }` | `ItemDocument` | Link document to item |
| `inventory.documents.unlink` | mutation | `{ id }` | `void` | Remove link |
| `inventory.documents.listForItem` | query | `{ itemId }` | `ItemDocument[]` | Documents for an item |
| `inventory.documents.getThumbnail` | query | `{ paperlessDocumentId }` | `string (base64 or URL)` | Proxy thumbnail from Paperless-ngx |

### R6: Connection Configuration

**Environment variables:**
- `PAPERLESS_URL` — Paperless-ngx base URL
- `PAPERLESS_API_TOKEN` — API authentication token
- Document in `.env.example`

**tRPC procedures:**
- `inventory.paperless.testConnection` — verify Paperless-ngx is reachable and token is valid
- `inventory.paperless.getConfig` — return connection status

**Graceful degradation:**
- If `PAPERLESS_URL` not set: Documents section hidden on detail page. No error.
- If configured but unreachable: "Paperless-ngx unavailable" message in Documents section. Item detail page still works.

## Out of Scope

- Uploading documents to Paperless-ngx from POPS
- OCR or content extraction
- Auto-matching receipts to items
- Tag management in Paperless-ngx from POPS
- Linking documents to finance transactions (Documents Vault theme)
- Full document viewer within POPS (link out to Paperless-ngx)

## Acceptance Criteria

1. Paperless-ngx client authenticates and searches documents
2. Documents can be searched from within the item detail page
3. Documents can be linked to items with a type (receipt, warranty, manual, other)
4. Linked documents shown on item detail page grouped by type with thumbnails
5. Click document opens Paperless-ngx or downloads the file
6. Documents can be unlinked without affecting Paperless-ngx
7. One document can link to multiple items
8. Duplicate links prevented (same document to same item)
9. Graceful degradation when Paperless-ngx not configured or unreachable
10. `.env.example` updated with `PAPERLESS_URL` and `PAPERLESS_API_TOKEN`
11. Unit tests for API client (mocked responses)
12. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**

### US-1: Paperless-ngx API client
**As a** developer, **I want** a client for the Paperless-ngx REST API **so that** the linking feature can search and fetch documents.

**Acceptance criteria:**
- Client authenticates with API token
- Search, metadata fetch, thumbnail proxy work
- Connection test endpoint
- Unit tests with mocked responses

### US-2: Link documents to items
**As a** user, **I want** to link a Paperless-ngx receipt to an inventory item **so that** I can find proof of purchase from the item page.

**Acceptance criteria:**
- "Link Document" opens search modal
- Search returns Paperless-ngx results with thumbnails
- Select document type and link
- Linked document appears on detail page

### US-3: View and manage linked documents
**As a** user, **I want** to see linked documents on the item detail page **so that** I have everything in one place.

**Acceptance criteria:**
- Documents grouped by type (receipt, warranty, manual)
- Thumbnail preview per document
- Click to open in Paperless-ngx
- Download button
- Unlink action

### US-4: Graceful degradation
**As a** developer, **I want** the inventory app to work without Paperless-ngx **so that** the integration is optional.

**Acceptance criteria:**
- No errors when not configured
- Documents section hidden when not configured
- "Unavailable" message when configured but unreachable
