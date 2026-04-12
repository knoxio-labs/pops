import { describe, it, expect, beforeEach } from "vitest";
import type { ParsedTransaction } from "@pops/api/modules/finance/imports";
import {
  useImportStore,
  type ProcessedTransaction,
  type PendingEntity,
  type PendingChangeset,
} from "./importStore";

// ---------------------------------------------------------------------------
// importStore — parsedTransactionsFingerprint / processedForFingerprint tests
//
// The Step 3 "already processed" short-circuit is gated on
// `processedForFingerprint === parsedTransactionsFingerprint`. These tests
// exercise the store-level invariants that make that gate safe:
//
//   1. `setParsedTransactions` computes a content fingerprint from checksums.
//   2. Passing an identical list is a no-op for downstream state (Back→
//      Continue bounce without mutation).
//   3. Passing a *different* list wipes downstream processed/confirmed state
//      *and* clears `processedForFingerprint` so Step 3 cannot short-circuit
//      with stale results.
//   4. `setProcessedTransactions` pins results to the live fingerprint.
// ---------------------------------------------------------------------------

function makeTxn(checksum: string, description = "WOOLWORTHS"): ParsedTransaction {
  return {
    date: "2026-01-15",
    description,
    amount: -42.5,
    account: "Amex",
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

const sampleProcessed = (): {
  matched: ProcessedTransaction[];
  uncertain: ProcessedTransaction[];
  failed: ProcessedTransaction[];
  skipped: ProcessedTransaction[];
} => ({
  matched: [{ description: "WOOLWORTHS" } as unknown as ProcessedTransaction],
  uncertain: [],
  failed: [],
  skipped: [],
});

describe("importStore — parsed/processed fingerprint", () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  it("empty parsed list yields empty fingerprint", () => {
    useImportStore.getState().setParsedTransactions([]);
    expect(useImportStore.getState().parsedTransactionsFingerprint).toBe("");
  });

  it("computes a fingerprint from the concatenated checksums", () => {
    const txns = [makeTxn("a"), makeTxn("b"), makeTxn("c")];
    useImportStore.getState().setParsedTransactions(txns);
    // Implementation detail: checksums joined by '|'. Deliberately asserted
    // so a future refactor can't silently change the invalidation surface.
    expect(useImportStore.getState().parsedTransactionsFingerprint).toBe("a|b|c");
  });

  it("different checksum order yields a different fingerprint", () => {
    useImportStore.getState().setParsedTransactions([makeTxn("a"), makeTxn("b")]);
    const first = useImportStore.getState().parsedTransactionsFingerprint;
    useImportStore.getState().setParsedTransactions([makeTxn("b"), makeTxn("a")]);
    expect(useImportStore.getState().parsedTransactionsFingerprint).not.toBe(first);
  });

  it("re-setting an identical parsed list is a no-op for downstream processed state", () => {
    const txns = [makeTxn("a"), makeTxn("b")];
    useImportStore.getState().setParsedTransactions(txns);
    // Pretend processing finished.
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });
    const fp = useImportStore.getState().parsedTransactionsFingerprint;
    expect(useImportStore.getState().processedForFingerprint).toBe(fp);

    // Back→Continue bounce: re-set the same parsed list (same checksums).
    useImportStore.getState().setParsedTransactions([makeTxn("a"), makeTxn("b")]);

    // Processed state must survive so Step 3 can short-circuit.
    expect(useImportStore.getState().processedTransactions.matched).toHaveLength(1);
    expect(useImportStore.getState().processedForFingerprint).toBe(fp);
    expect(useImportStore.getState().parsedTransactionsFingerprint).toBe(fp);
  });

  it("setting a changed parsed list invalidates processed state and clears processedForFingerprint", () => {
    useImportStore.getState().setParsedTransactions([makeTxn("a")]);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });
    expect(useImportStore.getState().processedForFingerprint).not.toBeNull();

    // User went Back→Step 2, re-mapped columns, Continue — different checksums.
    useImportStore.getState().setParsedTransactions([makeTxn("x"), makeTxn("y")]);

    const state = useImportStore.getState();
    expect(state.parsedTransactionsFingerprint).toBe("x|y");
    expect(state.processedForFingerprint).toBeNull();
    expect(state.processedTransactions.matched).toHaveLength(0);
    expect(state.processedTransactions.uncertain).toHaveLength(0);
    expect(state.processedTransactions.failed).toHaveLength(0);
    expect(state.processedTransactions.skipped).toHaveLength(0);
  });

  it("setProcessedTransactions pins processedForFingerprint to the current parsed fingerprint", () => {
    useImportStore.getState().setParsedTransactions([makeTxn("z")]);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });
    expect(useImportStore.getState().processedForFingerprint).toBe("z");
  });

  it("setFile with a different file resets fingerprints and processed state", () => {
    useImportStore.getState().setParsedTransactions([makeTxn("a")]);
    useImportStore.getState().setProcessedTransactions({
      ...sampleProcessed(),
      warnings: undefined,
    });

    // Simulate picking a new file — uses the File shape the setFile comparator expects.
    const fakeFile = { name: "new.csv", size: 10, lastModified: 1 } as unknown as File;
    useImportStore.getState().setFile(fakeFile);

    const state = useImportStore.getState();
    expect(state.parsedTransactionsFingerprint).toBe("");
    expect(state.processedForFingerprint).toBeNull();
    expect(state.processedTransactions.matched).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Step range — currentStep supports 1..7 (PRD-031 adds step 7)
// ---------------------------------------------------------------------------

describe("importStore — step range", () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  it("nextStep caps at 7", () => {
    useImportStore.getState().goToStep(6);
    useImportStore.getState().nextStep();
    expect(useImportStore.getState().currentStep).toBe(7);
    useImportStore.getState().nextStep();
    expect(useImportStore.getState().currentStep).toBe(7);
  });

  it("prevStep floors at 1", () => {
    useImportStore.getState().goToStep(1);
    useImportStore.getState().prevStep();
    expect(useImportStore.getState().currentStep).toBe(1);
  });

  it("goToStep sets arbitrary step", () => {
    useImportStore.getState().goToStep(5);
    expect(useImportStore.getState().currentStep).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Pending entities (PRD-030 US-01)
// ---------------------------------------------------------------------------

function makePendingEntity(overrides: Partial<PendingEntity> = {}): PendingEntity {
  return {
    tempId: "temp-1",
    name: "Test Entity",
    type: "merchant",
    aliases: ["alias-1"],
    defaultTransactionType: "expense",
    defaultTags: ["food"],
    createdAt: "2026-04-12T00:00:00Z",
    ...overrides,
  };
}

describe("importStore — pendingEntities", () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  it("starts with an empty array", () => {
    expect(useImportStore.getState().pendingEntities).toEqual([]);
  });

  it("addPendingEntity appends to the list", () => {
    const e1 = makePendingEntity({ tempId: "t1" });
    const e2 = makePendingEntity({ tempId: "t2", name: "Second" });
    useImportStore.getState().addPendingEntity(e1);
    useImportStore.getState().addPendingEntity(e2);
    expect(useImportStore.getState().pendingEntities).toHaveLength(2);
    expect(useImportStore.getState().pendingEntities[0].tempId).toBe("t1");
    expect(useImportStore.getState().pendingEntities[1].tempId).toBe("t2");
  });

  it("removePendingEntity removes by tempId", () => {
    useImportStore.getState().addPendingEntity(makePendingEntity({ tempId: "t1" }));
    useImportStore.getState().addPendingEntity(makePendingEntity({ tempId: "t2" }));
    useImportStore.getState().removePendingEntity("t1");
    const entities = useImportStore.getState().pendingEntities;
    expect(entities).toHaveLength(1);
    expect(entities[0].tempId).toBe("t2");
  });

  it("removePendingEntity with unknown id is a no-op", () => {
    useImportStore.getState().addPendingEntity(makePendingEntity({ tempId: "t1" }));
    useImportStore.getState().removePendingEntity("nonexistent");
    expect(useImportStore.getState().pendingEntities).toHaveLength(1);
  });

  it("clearPendingEntities empties the list", () => {
    useImportStore.getState().addPendingEntity(makePendingEntity({ tempId: "t1" }));
    useImportStore.getState().addPendingEntity(makePendingEntity({ tempId: "t2" }));
    useImportStore.getState().clearPendingEntities();
    expect(useImportStore.getState().pendingEntities).toEqual([]);
  });

  it("reset clears pending entities", () => {
    useImportStore.getState().addPendingEntity(makePendingEntity({ tempId: "t1" }));
    useImportStore.getState().reset();
    expect(useImportStore.getState().pendingEntities).toEqual([]);
  });

  it("setFile with a different file clears pending entities", () => {
    useImportStore.getState().addPendingEntity(makePendingEntity({ tempId: "t1" }));
    const fakeFile = { name: "new.csv", size: 10, lastModified: 1 } as unknown as File;
    useImportStore.getState().setFile(fakeFile);
    expect(useImportStore.getState().pendingEntities).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Pending changesets (PRD-030 US-02)
// ---------------------------------------------------------------------------

function makePendingChangeset(overrides: Partial<PendingChangeset> = {}): PendingChangeset {
  return {
    id: "cs-1",
    changeSet: { source: "ai", reason: "test", ops: [{ op: "add", data: {} }] },
    approvedAt: "2026-04-12T01:00:00Z",
    description: "Fix entity mapping",
    ...overrides,
  };
}

describe("importStore — pendingChangesets", () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  it("starts with an empty array", () => {
    expect(useImportStore.getState().pendingChangesets).toEqual([]);
  });

  it("addPendingChangeset appends to the list", () => {
    const cs1 = makePendingChangeset({ id: "cs-1" });
    const cs2 = makePendingChangeset({ id: "cs-2", description: "Second" });
    useImportStore.getState().addPendingChangeset(cs1);
    useImportStore.getState().addPendingChangeset(cs2);
    expect(useImportStore.getState().pendingChangesets).toHaveLength(2);
    expect(useImportStore.getState().pendingChangesets[0].id).toBe("cs-1");
    expect(useImportStore.getState().pendingChangesets[1].id).toBe("cs-2");
  });

  it("removePendingChangeset removes by id", () => {
    useImportStore.getState().addPendingChangeset(makePendingChangeset({ id: "cs-1" }));
    useImportStore.getState().addPendingChangeset(makePendingChangeset({ id: "cs-2" }));
    useImportStore.getState().removePendingChangeset("cs-1");
    const changesets = useImportStore.getState().pendingChangesets;
    expect(changesets).toHaveLength(1);
    expect(changesets[0].id).toBe("cs-2");
  });

  it("removePendingChangeset with unknown id is a no-op", () => {
    useImportStore.getState().addPendingChangeset(makePendingChangeset({ id: "cs-1" }));
    useImportStore.getState().removePendingChangeset("nonexistent");
    expect(useImportStore.getState().pendingChangesets).toHaveLength(1);
  });

  it("clearPendingChangesets empties the list", () => {
    useImportStore.getState().addPendingChangeset(makePendingChangeset({ id: "cs-1" }));
    useImportStore.getState().addPendingChangeset(makePendingChangeset({ id: "cs-2" }));
    useImportStore.getState().clearPendingChangesets();
    expect(useImportStore.getState().pendingChangesets).toEqual([]);
  });

  it("reset clears pending changesets", () => {
    useImportStore.getState().addPendingChangeset(makePendingChangeset({ id: "cs-1" }));
    useImportStore.getState().reset();
    expect(useImportStore.getState().pendingChangesets).toEqual([]);
  });

  it("setFile with a different file clears pending changesets", () => {
    useImportStore.getState().addPendingChangeset(makePendingChangeset({ id: "cs-1" }));
    const fakeFile = { name: "new.csv", size: 10, lastModified: 1 } as unknown as File;
    useImportStore.getState().setFile(fakeFile);
    expect(useImportStore.getState().pendingChangesets).toEqual([]);
  });
});
