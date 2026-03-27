import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { extractPrefix } from "./ItemFormPage";

// ---------- prefix extraction tests (pure function) ----------

describe("extractPrefix", () => {
  it("extracts prefix from single-word type", () => {
    expect(extractPrefix("Electronics")).toBe("ELECTRONICS".slice(0, 4));
  });

  it("handles short types (≤6 chars)", () => {
    expect(extractPrefix("Tools")).toBe("TOOLS");
    expect(extractPrefix("Office")).toBe("OFFICE");
  });

  it("takes first word of multi-word type", () => {
    expect(extractPrefix("HDMI Cable")).toBe("HDMI");
  });

  it("truncates long first words to 4 characters", () => {
    expect(extractPrefix("Electronics")).toBe("ELEC");
    expect(extractPrefix("Furniture")).toBe("FURN");
    expect(extractPrefix("Appliance")).toBe("APPL");
  });

  it("uppercases the prefix", () => {
    expect(extractPrefix("kitchen")).toBe("KITC");
  });

  it("keeps 5-6 char words intact", () => {
    expect(extractPrefix("Sport")).toBe("SPORT");
    expect(extractPrefix("Camera")).toBe("CAMERA");
  });
});

// ---------- zero-padding format tests ----------

describe("zero-padding format", () => {
  it("pads single digit to 2 digits", () => {
    const num = 1;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, "0");
    expect(padded).toBe("01");
  });

  it("pads double digit to 2 digits", () => {
    const num = 42;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, "0");
    expect(padded).toBe("42");
  });

  it("uses 3 digits for 100+", () => {
    const num = 100;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, "0");
    expect(padded).toBe("100");
  });

  it("uses 3 digits for larger numbers", () => {
    const num = 256;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, "0");
    expect(padded).toBe("256");
  });
});

// ---------- component tests ----------

const mockItemQuery = vi.fn();
const mockListQuery = vi.fn();
const mockSearchByAssetIdFetch = vi.fn();
const mockCountByAssetPrefixFetch = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockConnectMutate = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    inventory: {
      items: {
        get: { useQuery: (...args: unknown[]) => mockItemQuery(...args) },
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        create: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutate: (...args: unknown[]) => {
              mockCreateMutate(...args);
              if (typeof opts.onSuccess === "function")
                (opts.onSuccess as (...args: unknown[]) => void)({ data: { id: "new-id" } });
            },
            isPending: false,
          }),
        },
        update: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutate: (...args: unknown[]) => {
              mockUpdateMutate(...args);
              if (typeof opts.onSuccess === "function")
                (opts.onSuccess as (...args: unknown[]) => void)();
            },
            isPending: false,
          }),
        },
      },
      connections: {
        connect: {
          useMutation: () => ({ mutateAsync: mockConnectMutate }),
        },
      },
    },
    useUtils: () => ({
      inventory: {
        items: {
          list: { invalidate: vi.fn() },
          get: { invalidate: vi.fn() },
          searchByAssetId: { fetch: mockSearchByAssetIdFetch },
          countByAssetPrefix: { fetch: mockCountByAssetPrefixFetch },
        },
      },
    }),
  },
}));

import { ItemFormPage } from "./ItemFormPage";

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={["/inventory/items/new"]}>
      <Routes>
        <Route path="/inventory/items/new" element={<ItemFormPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEdit(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/inventory/items/${id}/edit`]}>
      <Routes>
        <Route path="/inventory/items/:id/edit" element={<ItemFormPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mockItemQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });

  mockListQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
  });

  mockSearchByAssetIdFetch.mockResolvedValue({ data: null });
  mockCountByAssetPrefixFetch.mockResolvedValue({ data: 0 });
});

describe("ItemFormPage — Asset ID generation", () => {
  it("renders auto-generate button", () => {
    renderCreate();
    expect(screen.getByRole("button", { name: /auto-generate/i })).toBeInTheDocument();
  });

  it("disables auto-generate when type is empty", () => {
    renderCreate();
    const btn = screen.getByRole("button", { name: /auto-generate/i });
    expect(btn).toBeDisabled();
  });

  it("enables auto-generate when type is selected", () => {
    renderCreate();
    const typeSelect = screen.getByRole("combobox", { name: /type/i });
    fireEvent.change(typeSelect, { target: { value: "Electronics" } });
    const btn = screen.getByRole("button", { name: /auto-generate/i });
    expect(btn).not.toBeDisabled();
  });

  it("shows asset ID uniqueness error on blur when taken", async () => {
    mockSearchByAssetIdFetch.mockResolvedValue({
      data: { id: "other-item", itemName: "Existing Item" },
    });

    renderCreate();
    const assetInput = screen.getByRole("textbox", { name: /asset id/i });
    fireEvent.change(assetInput, { target: { value: "ELEC01" } });
    fireEvent.blur(assetInput);

    // Wait for async validation
    await vi.waitFor(() => {
      expect(screen.getByText(/Asset ID already in use by Existing Item/)).toBeInTheDocument();
    });
  });

  it("skips uniqueness error for own asset ID in edit mode", async () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: "item-1",
          itemName: "MacBook",
          brand: null,
          model: null,
          itemId: null,
          type: "Electronics",
          condition: "Good",
          room: null,
          inUse: false,
          deductible: false,
          purchaseDate: null,
          warrantyExpires: null,
          replacementValue: null,
          resaleValue: null,
          assetId: "ELEC01",
          notes: null,
          locationId: null,
          lastEditedTime: "2026-01-01",
          purchaseTransactionId: null,
          purchasedFromId: null,
          purchasedFromName: null,
        },
      },
      isLoading: false,
      error: null,
    });

    mockSearchByAssetIdFetch.mockResolvedValue({
      data: { id: "item-1", itemName: "MacBook" },
    });

    renderEdit("item-1");

    const assetInput = screen.getByDisplayValue("ELEC01");
    fireEvent.blur(assetInput);

    await vi.waitFor(() => {
      expect(mockSearchByAssetIdFetch).toHaveBeenCalledWith({ assetId: "ELEC01" });
    });
    expect(screen.queryByText(/Asset ID already in use/)).not.toBeInTheDocument();
  });

  it("skips uniqueness check when asset ID is empty", () => {
    renderCreate();
    const assetInput = screen.getByRole("textbox", { name: /asset id/i });
    fireEvent.blur(assetInput);
    expect(mockSearchByAssetIdFetch).not.toHaveBeenCalled();
  });
});
