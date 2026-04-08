import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestContext } from "../../../shared/test-utils.js";
import { getDrizzle } from "../../../db.js";
import { tagVocabulary, transactionTagRules } from "@pops/db-types";

const ctx = setupTestContext();

describe("tagRules", () => {
  let caller: ReturnType<typeof ctx.setup>["caller"];

  beforeEach(() => {
    const result = ctx.setup();
    caller = result.caller;
  });

  afterEach(() => {
    ctx.teardown();
  });

  it("lists seeded vocabulary tags", async () => {
    // The schema initializer seeds tag vocabulary for new databases.
    const res = await caller.core.tagRules.listVocabulary();
    expect(res.tags.length).toBeGreaterThan(0);
    expect(res.tags).toContain("Groceries");
  });

  it("proposes a ChangeSet and returns deterministic preview with New tags marked", async () => {
    // Ensure vocabulary has a known tag but not the new one.
    const orm = getDrizzle();
    orm.delete(tagVocabulary).run();
    orm.insert(tagVocabulary).values({ tag: "Groceries", source: "seed", isActive: true }).run();

    const res = await caller.core.tagRules.proposeTagRuleChangeSet({
      signal: {
        descriptionPattern: "WOOLWORTHS",
        matchType: "contains",
        tags: ["Groceries", "BrandNewTag"],
      },
      transactions: [
        { transactionId: "t1", description: "WOOLWORTHS 1234" },
        { transactionId: "t2", description: "OTHER 1" },
      ],
      maxPreviewItems: 200,
    });

    expect(res.changeSet.ops).toHaveLength(1);
    expect(res.preview.counts.affected).toBe(1);
    const affected = res.preview.affected[0]!;
    expect(affected.transactionId).toBe("t1");
    expect(
      affected.after.suggestedTags.some((t) => t.tag === "Groceries" && t.isNew === false)
    ).toBe(true);
    expect(
      affected.after.suggestedTags.some((t) => t.tag === "BrandNewTag" && t.isNew === true)
    ).toBe(true);
  });

  it("apply persists accepted New tags into vocabulary and inserts tag rule rows", async () => {
    const orm = getDrizzle();
    orm.delete(tagVocabulary).run();
    orm.delete(transactionTagRules).run();
    orm.insert(tagVocabulary).values({ tag: "Groceries", source: "seed", isActive: true }).run();

    const changeSet = {
      ops: [
        {
          op: "add" as const,
          data: {
            descriptionPattern: "WOOLWORTHS",
            matchType: "contains" as const,
            tags: ["Groceries", "BrandNewTag"],
            confidence: 0.95,
            isActive: true,
          },
        },
      ],
    };

    const res = await caller.core.tagRules.applyTagRuleChangeSet({
      changeSet,
      acceptedNewTags: ["BrandNewTag"],
    });

    expect(res.rules.length).toBe(1);
    const vocab = orm.select({ tag: tagVocabulary.tag }).from(tagVocabulary).all();
    expect(vocab.map((v) => v.tag)).toContain("BrandNewTag");
  });

  it("reject requires feedback and applies no changes", async () => {
    const orm = getDrizzle();
    orm.delete(transactionTagRules).run();

    await expect(
      caller.core.tagRules.rejectTagRuleChangeSet({
        changeSet: {
          ops: [
            {
              op: "add",
              data: { descriptionPattern: "X", matchType: "contains", tags: ["Groceries"] },
            },
          ],
        },
        feedback: "",
      })
    ).rejects.toThrow();

    const rules = orm.select().from(transactionTagRules).all();
    expect(rules.length).toBe(0);
  });
});
