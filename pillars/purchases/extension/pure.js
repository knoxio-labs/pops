/**
 * Everything the extension decides, with nothing it does.
 *
 * Split out from `observe.js` and `capture.js` so it can be tested. Those
 * two are unavoidably about a live browser — they patch `fetch` and
 * `XMLHttpRequest` and talk to a logged-in session — but the reasoning they
 * carry out is ordinary and every bug found in this extension so far has
 * been in exactly these functions:
 *
 *   - `popsResultsIn` read `data.activityHome` by name, so it saw the first
 *     page of the list and silently ignored every page after it, which
 *     arrive under `data.activityHomeNextPage`.
 *   - `popsTemplateKind` decides what may be replayed at all.
 *   - `popsHeadersFrom` is what stops a replay answering `401`.
 *
 * Loaded first by the manifest, so `popsPure` is in scope for the other
 * two. Nothing here touches the network, the DOM or `window`.
 */
/**
 * Somewhere to keep the captured requests that is not readable.
 *
 * A template carries the session's `Authorization` and `client_id` headers,
 * because a replay without them answers `401`. Anything reachable by name
 * from the page — a global, or a property of `window.__popsEveryday` — is
 * readable by every other script in the MAIN world, including whatever the
 * site loads next. The token is already in the page and could be stolen the
 * same way this extension obtains it, but handing it out on a documented
 * global makes that trivial rather than deliberate.
 *
 * So the templates go in a closure and never come out. The vault issues
 * the request itself; callers pass variables and get JSON back.
 */
function popsTemplateVault(fetchImpl) {
  const templates = { details: null, page: null };

  return {
    remember(kind, template) {
      if (kind !== null && templates[kind] === null) templates[kind] = template;
    },
    has(kind) {
      return templates[kind] !== null;
    },
    async post(kind, variables) {
      const template = templates[kind];
      if (template === null) throw new Error(`no ${kind} request has been observed yet`);
      const response = await fetchImpl(template.url, {
        method: 'POST',
        credentials: 'include',
        headers: { ...template.headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          query: template.query,
          variables: { ...template.variables, ...variables },
        }),
      });
      if (!response.ok) {
        // 401 means the captured token has expired, which is a page reload
        // away from fixed and not worth a generic message.
        const hint = response.status === 401 ? ' — reload the page and start again' : '';
        throw new Error(`the site answered HTTP ${String(response.status)}${hint}`);
      }
      const json = await response.json();
      // GraphQL answers 200 with an `errors` array. Absorbing that silently
      // records nothing and looks exactly like a receipt with no items.
      if (Array.isArray(json?.errors) && json.errors.length > 0) {
        throw new Error(String(json.errors[0]?.message ?? 'the API returned an error'));
      }
      return json;
    },
  };
}

/** `undefined` and `null` mean the same thing in this payload. */
function popsOrNull(value) {
  return value ?? null;
}

const popsPure = {
  /**
   * The list payload, whichever operation produced it.
   *
   * `RewardsActivityHome` answers under `activityHome` and
   * `RewardsActivityHomeNextPage` under `activityHomeNextPage`. Naming
   * either means missing the other, so this looks for the shape instead.
   *
   * The shape it looks for deliberately does NOT require `sections` to be
   * an array. The last page of a history answers `{ sections: null,
   * nextPageToken: null }` — a real, empty, final page. Requiring the array
   * made that unrecognisable, so the cursor never moved, and the walk ended
   * with "the list stopped advancing" instead of "that was everything".
   * Having `sections` or `nextPageToken` as a key at all is what marks a
   * list; a receipt response has neither.
   */
  resultsIn(json) {
    for (const value of Object.values(json?.data ?? {})) {
      const results = value?.results;
      if (results == null || typeof results !== 'object') continue;
      if ('sections' in results || 'nextPageToken' in results) return results;
    }
    return null;
  },

  /**
   * A list row worth keeping, or null for one that is not a shop.
   *
   * Either signal is enough. Requiring `receipt` alone dropped a shop that
   * had one — the real export came back with 45 receipts against 44 listed
   * rows — and the cost of keeping a row that turns out to have no receipt
   * is one wasted request whose answer is simply not stored, while the cost
   * of dropping one is a purchase missing from the year with nothing to say
   * so.
   */
  rowFrom(item, sectionTitle) {
    const id = item?.activityDetailsId;
    if (typeof id !== 'string') return null;
    const receipt = popsOrNull(item.receipt);
    if (receipt === null && item.transactionType !== 'purchase') return null;
    const analytics = receipt === null ? {} : (popsOrNull(receipt.analytics) ?? {});
    return {
      activityDetailsId: id,
      description: popsOrNull(item.description),
      displayDate: popsOrNull(item.displayDate),
      sectionTitle,
      transaction: popsOrNull(item.transaction),
      transactionType: popsOrNull(item.transactionType),
      receiptSource: receipt === null ? null : popsOrNull(receipt.receiptSource),
      partnerName: popsOrNull(analytics.partnerName),
    };
  },

  /**
   * Every keepable row in a list response, plus the cursor that follows it.
   *
   * `nextPageToken` is `null` at the end of history and `undefined` when
   * the response was not a list at all — the caller must not confuse them,
   * so a non-list answer reports `rows: null`.
   */
  rowsFrom(json) {
    const results = this.resultsIn(json);
    if (results === null) return { rows: null, nextPageToken: undefined };
    const rows = [];
    for (const section of results.sections ?? []) {
      const title = typeof section.sectionTitle === 'string' ? section.sectionTitle : null;
      for (const item of section.sectionItems ?? []) {
        const row = this.rowFrom(item, title);
        if (row !== null) rows.push(row);
      }
    }
    return { rows, nextPageToken: results.nextPageToken ?? null };
  },

  /** Which request a captured query can stand in for, if any. */
  templateKind(query) {
    const text = query ?? '';
    if (/\$pageToken/.test(text)) return 'page';
    if (/activityDetails\s*\(/i.test(text)) return 'details';
    return null;
  },

  /** The `ReceiptDetails` tab of a receipt response, or null. */
  receiptPageIn(json) {
    const tabs = json?.data?.activityDetails?.tabs ?? [];
    return tabs.find((tab) => tab?.page?.__typename === 'ReceiptDetails')?.page ?? null;
  },

  /**
   * Request headers as a plain object, from a `Headers`, an entry array or
   * an object — `fetch` accepts all three and the app is free to use any.
   */
  headersFrom(source) {
    const headers = {};
    if (source == null) return headers;
    if (typeof source.forEach === 'function' && !Array.isArray(source)) {
      source.forEach((value, name) => {
        headers[name] = value;
      });
      return headers;
    }
    for (const [name, value] of Array.isArray(source) ? source : Object.entries(source)) {
      headers[name] = value;
    }
    return headers;
  },

  /** Listed receipts not captured yet, in the order they were listed. */
  pendingIds(listRows, receipts) {
    return [...listRows.keys()].filter((id) => !receipts.has(id));
  },

  /**
   * The export file.
   *
   * Carries the receipts and the list rows and nothing else — in
   * particular not the templates, which hold the session's bearer token.
   */
  exportFrom(listRows, receipts, capturedAt) {
    return {
      source: 'woolworths-everyday-rewards',
      formatVersion: 1,
      capturedAt,
      receipts: [...receipts].map(([id, page]) => ({
        activityDetailsId: id,
        listRow: listRows.get(id) ?? null,
        receipt: page,
      })),
    };
  },
};

// The other two content scripts run as separate classic scripts, so this is
// how they reach these. Only the factory is shared: the vault INSTANCE, and
// the request templates inside it, stay private to `observe.js`.
globalThis.popsPure = popsPure;
globalThis.popsTemplateVault = popsTemplateVault;
