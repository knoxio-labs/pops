/**
 * Item photos router tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Database } from "better-sqlite3";
import { TRPCError } from "@trpc/server";
import {
  setupTestContext,
  createCaller,
  seedInventoryItem,
  seedPhoto,
} from "../../../shared/test-utils.js";

const ctx = setupTestContext();
let caller: ReturnType<typeof createCaller>;
let db: Database;
let tempDir: string;

beforeEach(() => {
  ({ caller, db } = ctx.setup());
  tempDir = mkdtempSync(join(tmpdir(), "pops-photos-test-"));
  vi.stubEnv("INVENTORY_IMAGES_DIR", tempDir);
});

afterEach(() => {
  ctx.teardown();
  vi.unstubAllEnvs();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("inventory.photos.attach", () => {
  it("attaches a photo to an item", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });

    const result = await caller.inventory.photos.attach({
      itemId,
      filePath: "items/tv/front.jpg",
      caption: "Front view",
      sortOrder: 0,
    });

    expect(result.data).toMatchObject({
      itemId,
      filePath: "items/tv/front.jpg",
      caption: "Front view",
      sortOrder: 0,
    });
    expect(result.data.id).toBeTypeOf("number");
    expect(result.data.createdAt).toBeTypeOf("string");
    expect(result.message).toBe("Photo attached");
  });

  it("defaults sortOrder to 0", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });

    const result = await caller.inventory.photos.attach({
      itemId,
      filePath: "items/tv/photo.jpg",
    });

    expect(result.data.sortOrder).toBe(0);
  });

  it("defaults caption to null", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });

    const result = await caller.inventory.photos.attach({
      itemId,
      filePath: "items/tv/photo.jpg",
    });

    expect(result.data.caption).toBeNull();
  });

  it("throws NOT_FOUND when item does not exist", async () => {
    await expect(
      caller.inventory.photos.attach({
        itemId: "nonexistent",
        filePath: "items/test/photo.jpg",
      })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.photos.attach({
        itemId: "nonexistent",
        filePath: "items/test/photo.jpg",
      });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("persists to the database", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });

    await caller.inventory.photos.attach({
      itemId,
      filePath: "items/tv/photo.jpg",
    });

    const row = db.prepare("SELECT * FROM item_photos WHERE item_id = ?").get(itemId) as
      | { file_path: string }
      | undefined;

    expect(row).toBeDefined();
    if (!row) return;
    expect(row.file_path).toBe("items/tv/photo.jpg");
  });

  it("rejects path traversal with '..'", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });

    await expect(
      caller.inventory.photos.attach({
        itemId,
        filePath: "../../../etc/passwd",
      })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.photos.attach({
        itemId,
        filePath: "../../../etc/passwd",
      });
    } catch (err) {
      expect((err as TRPCError).code).toBe("BAD_REQUEST");
    }
  });

  it("rejects absolute file paths", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });

    await expect(
      caller.inventory.photos.attach({
        itemId,
        filePath: "/etc/passwd",
      })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.photos.attach({
        itemId,
        filePath: "/etc/passwd",
      });
    } catch (err) {
      expect((err as TRPCError).code).toBe("BAD_REQUEST");
    }
  });
});

describe("inventory.photos.remove", () => {
  it("removes an existing photo", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });
    const photoId = seedPhoto(db, { item_id: itemId });

    const result = await caller.inventory.photos.remove({ id: photoId });

    expect(result.message).toBe("Photo removed");

    const row = db.prepare("SELECT * FROM item_photos WHERE id = ?").get(photoId);
    expect(row).toBeUndefined();
  });

  it("throws NOT_FOUND for nonexistent photo", async () => {
    await expect(caller.inventory.photos.remove({ id: 999 })).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.photos.remove({ id: 999 });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("removes the file from disk when deleting an uploaded photo", async () => {
    const itemId = seedInventoryItem(db, { item_name: "Camera Item" });

    const sharp = (await import("sharp")).default;
    const tinyPng = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const uploadResult = await caller.inventory.photos.upload({
      itemId,
      data: tinyPng.toString("base64"),
    });

    // Verify file exists on disk
    const { join } = await import("node:path");
    const filePath = join(tempDir, uploadResult.data.filePath);
    expect(existsSync(filePath)).toBe(true);

    // Remove the photo
    await caller.inventory.photos.remove({ id: uploadResult.data.id });

    // Verify file is deleted from disk
    expect(existsSync(filePath)).toBe(false);

    // Verify DB record is also gone
    const row = db.prepare("SELECT * FROM item_photos WHERE id = ?").get(uploadResult.data.id);
    expect(row).toBeUndefined();
  });
});

describe("inventory.photos.update", () => {
  it("updates caption", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });
    const photoId = seedPhoto(db, { item_id: itemId, caption: "Old caption" });

    const result = await caller.inventory.photos.update({
      id: photoId,
      data: { caption: "New caption" },
    });

    expect(result.data.caption).toBe("New caption");
    expect(result.message).toBe("Photo updated");
  });

  it("updates sortOrder", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });
    const photoId = seedPhoto(db, { item_id: itemId, sort_order: 0 });

    const result = await caller.inventory.photos.update({
      id: photoId,
      data: { sortOrder: 5 },
    });

    expect(result.data.sortOrder).toBe(5);
  });

  it("sets caption to null", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });
    const photoId = seedPhoto(db, { item_id: itemId, caption: "Has caption" });

    const result = await caller.inventory.photos.update({
      id: photoId,
      data: { caption: null },
    });

    expect(result.data.caption).toBeNull();
  });

  it("throws NOT_FOUND for nonexistent photo", async () => {
    await expect(
      caller.inventory.photos.update({ id: 999, data: { caption: "test" } })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.photos.update({ id: 999, data: { caption: "test" } });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });
});

describe("inventory.photos.listForItem", () => {
  it("returns empty list when no photos exist", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });

    const result = await caller.inventory.photos.listForItem({ itemId });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("returns photos ordered by sortOrder", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });
    seedPhoto(db, { item_id: itemId, file_path: "c.jpg", sort_order: 2 });
    seedPhoto(db, { item_id: itemId, file_path: "a.jpg", sort_order: 0 });
    seedPhoto(db, { item_id: itemId, file_path: "b.jpg", sort_order: 1 });

    const result = await caller.inventory.photos.listForItem({ itemId });

    expect(result.data).toHaveLength(3);
    expect(result.data[0]!.filePath).toBe("a.jpg");
    expect(result.data[1]!.filePath).toBe("b.jpg");
    expect(result.data[2]!.filePath).toBe("c.jpg");
  });

  it("only returns photos for the specified item", async () => {
    const itemA = seedInventoryItem(db, { item_name: "TV" });
    const itemB = seedInventoryItem(db, { item_name: "Radio" });
    seedPhoto(db, { item_id: itemA, file_path: "tv.jpg" });
    seedPhoto(db, { item_id: itemB, file_path: "radio.jpg" });

    const result = await caller.inventory.photos.listForItem({ itemId: itemA });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.filePath).toBe("tv.jpg");
  });

  it("paginates results", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });
    for (let i = 0; i < 5; i++) {
      seedPhoto(db, { item_id: itemId, file_path: `photo${i}.jpg`, sort_order: i });
    }

    const page1 = await caller.inventory.photos.listForItem({
      itemId,
      limit: 2,
      offset: 0,
    });

    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.total).toBe(5);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await caller.inventory.photos.listForItem({
      itemId,
      limit: 2,
      offset: 4,
    });

    expect(page2.data).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
  });
});

describe("inventory.photos.reorder", () => {
  it("reorders photos by setting sortOrder from array position", async () => {
    const itemId = seedInventoryItem(db, { item_name: "TV" });
    const id1 = seedPhoto(db, { item_id: itemId, file_path: "a.jpg", sort_order: 0 });
    const id2 = seedPhoto(db, { item_id: itemId, file_path: "b.jpg", sort_order: 1 });
    const id3 = seedPhoto(db, { item_id: itemId, file_path: "c.jpg", sort_order: 2 });

    // Reverse the order
    const result = await caller.inventory.photos.reorder({
      itemId,
      orderedIds: [id3, id2, id1],
    });

    expect(result.data).toHaveLength(3);
    expect(result.data[0]!.filePath).toBe("c.jpg");
    expect(result.data[0]!.sortOrder).toBe(0);
    expect(result.data[1]!.filePath).toBe("b.jpg");
    expect(result.data[1]!.sortOrder).toBe(1);
    expect(result.data[2]!.filePath).toBe("a.jpg");
    expect(result.data[2]!.sortOrder).toBe(2);
    expect(result.message).toBe("Photos reordered");
  });

  it("throws NOT_FOUND when item does not exist", async () => {
    await expect(
      caller.inventory.photos.reorder({
        itemId: "nonexistent",
        orderedIds: [1],
      })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.inventory.photos.reorder({
        itemId: "nonexistent",
        orderedIds: [1],
      });
    } catch (err) {
      expect((err as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("throws NOT_FOUND when photo belongs to different item", async () => {
    const itemA = seedInventoryItem(db, { item_name: "TV" });
    const itemB = seedInventoryItem(db, { item_name: "Radio" });
    const photoId = seedPhoto(db, { item_id: itemB });

    await expect(
      caller.inventory.photos.reorder({
        itemId: itemA,
        orderedIds: [photoId],
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("inventory.photos.upload", () => {
  it("uploads and compresses a photo", async () => {
    const itemId = seedInventoryItem(db, { item_name: "Camera Item" });

    // Create a tiny valid PNG (1x1 pixel) as base64
    const sharp = (await import("sharp")).default;
    const tinyPng = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const base64Data = tinyPng.toString("base64");

    const result = await caller.inventory.photos.upload({
      itemId,
      data: base64Data,
      caption: "Test photo",
    });

    expect(result.message).toBe("Photo uploaded");
    expect(result.data.itemId).toBe(itemId);
    expect(result.data.caption).toBe("Test photo");
    expect(result.data.filePath).toMatch(/^items\/.+\/photo_001\.jpg$/);
  });

  it("uses sequential filenames", async () => {
    const itemId = seedInventoryItem(db, { item_name: "Multi Photo Item" });

    const sharp = (await import("sharp")).default;
    const tinyPng = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png()
      .toBuffer();
    const base64Data = tinyPng.toString("base64");

    const result1 = await caller.inventory.photos.upload({ itemId, data: base64Data });
    const result2 = await caller.inventory.photos.upload({ itemId, data: base64Data });

    expect(result1.data.filePath).toContain("photo_001.jpg");
    expect(result2.data.filePath).toContain("photo_002.jpg");
  });

  it("throws NOT_FOUND when item does not exist", async () => {
    const sharp = (await import("sharp")).default;
    const tinyPng = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer();

    await expect(
      caller.inventory.photos.upload({
        itemId: "nonexistent",
        data: tinyPng.toString("base64"),
      })
    ).rejects.toThrow(TRPCError);
  });

  it("throws UNAUTHORIZED without auth", async () => {
    const unauthCaller = createCaller(false);
    await expect(
      unauthCaller.inventory.photos.upload({ itemId: "a", data: "dGVzdA==" })
    ).rejects.toThrow(TRPCError);
  });
});

describe("inventory.photos auth", () => {
  it("throws UNAUTHORIZED without auth on attach", async () => {
    const unauthCaller = createCaller(false);
    await expect(
      unauthCaller.inventory.photos.attach({ itemId: "a", filePath: "test.jpg" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws UNAUTHORIZED without auth on remove", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.inventory.photos.remove({ id: 1 })).rejects.toThrow(TRPCError);
  });

  it("throws UNAUTHORIZED without auth on update", async () => {
    const unauthCaller = createCaller(false);
    await expect(
      unauthCaller.inventory.photos.update({ id: 1, data: { caption: "test" } })
    ).rejects.toThrow(TRPCError);
  });

  it("throws UNAUTHORIZED without auth on listForItem", async () => {
    const unauthCaller = createCaller(false);
    await expect(unauthCaller.inventory.photos.listForItem({ itemId: "a" })).rejects.toThrow(
      TRPCError
    );
  });

  it("throws UNAUTHORIZED without auth on reorder", async () => {
    const unauthCaller = createCaller(false);
    await expect(
      unauthCaller.inventory.photos.reorder({ itemId: "a", orderedIds: [1] })
    ).rejects.toThrow(TRPCError);
  });
});
