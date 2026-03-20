# FS-007: AI Categorisation

## What It Is

Claude Haiku-powered entity identification and category suggestion, used as a fallback when the 5-stage rule-based entity matcher fails. The AI reads a bank transaction description and returns a merchant name and category. Results are cached to disk so the same description never triggers a second API call.

## How It Works

1. The import pipeline tries stages 1-5 of entity matching (aliases → exact → prefix → contains → punctuation)
2. If no match: check the disk cache (`ai_entity_cache.json`) for this description
3. If cache miss: call Claude Haiku API
4. Parse the response: extract entity name and category
5. Cache the result to disk
6. Log the API call in `ai_usage` table

## AI Call Details

**Model:** `claude-haiku-4-5-20251001`

**Prompt structure:** Send the raw bank description and ask for a JSON response with:
- `entityName` — the merchant or payee name
- `category` — the type of business (e.g., "Supermarket", "Restaurant")

**Privacy:** Only the transaction description is sent to Claude. No account numbers, amounts, dates, or personal information.

**Response parsing:** JSON parsed from the response. If parsing fails, the transaction is marked as "uncertain" for manual review.

## Caching

**File:** `ai_entity_cache.json`

**Key:** Uppercase description string (normalised)
**Value:** `{ entityName: string, category: string }`

**Behaviour:**
- Checked before every AI call
- Written after every successful AI call
- Persisted to disk (survives process restarts)
- ~90%+ hit rate after initial import (most bank descriptions repeat)

**Cache invalidation:** None. Cache entries persist indefinitely. If an entry is wrong, the user corrects it manually during import review — the cache is a suggestion, not a commitment.

## Cost Tracking

**Table:** `ai_usage`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | INTEGER PK | Auto-increment |
| `description` | TEXT | The bank description that triggered the call |
| `entity_name` | TEXT | The entity name returned by AI |
| `category` | TEXT | The category returned by AI |
| `input_tokens` | INTEGER | Tokens sent to Claude |
| `output_tokens` | INTEGER | Tokens received from Claude |
| `cost_usd` | REAL | Estimated cost in USD |
| `cached` | INTEGER | 0 = API call, 1 = cache hit |
| `import_batch_id` | TEXT | Links to the import session that triggered this |
| `created_at` | TEXT | ISO timestamp |

**Dashboard stats available:**
- Total cost (lifetime)
- Total API calls vs cache hits
- Cache hit rate
- Average cost per call
- Token counts (input/output)
- Last 30 days breakdown

## Rate Limiting

- Claude API rate limits: 429 responses trigger exponential backoff
- Backoff: 1s → 2s → 4s → 8s → 16s (max 5 retries)
- If all retries fail, the transaction is marked as "uncertain" — no crash, no data loss

## Integration Points

- **Import pipeline (FS-002):** AI is called during entity matching (stage 6 fallback)
- **Tag suggestion:** AI can suggest tags via the `suggestTags` procedure (not just entities)
- **Cost dashboard:** AI Usage page shows lifetime and recent cost data

## Business Rules

1. **AI is a fallback, not a primary.** Rule-based matching handles 95%+ of transactions. AI only fires for genuinely unknown descriptions.
2. **AI results are suggestions.** The user reviews and can override during import. AI output is never auto-committed without review.
3. **Cache is the first check.** Before calling Claude, check the disk cache. This reduces API costs by ~90%.
4. **Cost target:** ~$1-5/month for a typical import cadence. Actual cost depends on how many new merchants are encountered.
5. **PII stripping:** Only merchant descriptions are sent. No amounts, dates, account numbers, or personal data.

## Current Limitations

- No batch mode for AI calls (one description per API call)
- No confidence score from AI (it either returns a result or doesn't)
- No retraining or fine-tuning — uses Claude's general knowledge
- Cache has no TTL — stale entries persist until manually cleared
