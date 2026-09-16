import DesignSystem
import SwiftUI

/// An untyped item's own screen.
///
/// The detail of an item with nothing structured on it is mostly an absence,
/// and the design question is what fills it. Not a placeholder grid of fields
/// nobody can answer: the note, said plainly, and one line about what would
/// change if a type arrived.
internal struct InventoryUntypedDetailView: View {
    internal let entry: InventoryUntypedItem
    @Environment(\.inventoryUntypedStyle) private var style

    internal var body: some View {
        List {
            Section {
                HStack(spacing: PopsSpacing.sm) {
                    InventoryItemRow(item: entry.item)
                    if style.listPresence == .badge { InventoryNoTypeBadge() }
                }
            }
            Section {
                LabeledContent("Type") {
                    Text(typeValue).foregroundStyle(Color.popsInventory)
                }
                LabeledContent("Filed", value: entry.filed)
            } footer: {
                InventoryTypeSourceNote(typeFooter)
            }
            Section {
                Text(entry.note)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            } header: {
                Text("Note")
            } footer: {
                Text("Everything this item knows. Search reads it as words, not as values.")
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    private var typeValue: String { entry.isKeptUntyped ? "Kept untyped" : "No type yet" }

    private var typeFooter: String {
        entry.isKeptUntyped
            ? "You said nothing will ever share this. It is not waiting for anything."
            : "If an update adds a type that covers this, it gains that type's fields, empty."
    }
}

/// The same item in a list of typed ones.
///
/// The question the list is here to answer is whether an untyped item reads as
/// unfinished work or as an ordinary thing that happens to lack a type. Each
/// presence answers it differently, and the sections are the same in all three
/// so only the treatment differs.
internal struct InventoryUntypedListView: View {
    @Environment(\.inventoryUntypedStyle) private var style

    private var typed: [InventoryFoundationItem] {
        [
            InventoryFoundationFixtures.television, InventoryFoundationFixtures.cable,
            InventoryFoundationFixtures.screws,
        ]
    }

    private var untyped: [InventoryUntypedItem] {
        [
            InventoryUntypedFixtures.canvasBag, InventoryUntypedFixtures.bikePump,
            InventoryUntypedFixtures.tablecloth,
        ]
    }

    internal var body: some View {
        List {
            if style.listPresence == .grouped {
                Section("On a type") { ForEach(typed) { InventoryItemRow(item: $0) } }
                Section {
                    ForEach(untyped) { InventoryUntypedRow(entry: $0) }
                } header: {
                    Text("No type yet")
                } footer: {
                    Text("Held apart so the list above is comparable. They are still counted.")
                }
            } else {
                Section {
                    ForEach(interleaved) { row in row.view }
                } footer: {
                    Text(mixedFooter)
                }
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    private var mixedFooter: String {
        style.listPresence == .badge
            ? "Sorted by name. An untyped item carries a chip as well as its detail line."
            : "Sorted by name. An untyped item says so in its detail line and nowhere else."
    }

    /// Typed and untyped in one alphabetical run, which is the arrangement the
    /// question is actually about: a reader scanning a list is not looking for
    /// the untyped ones.
    private var interleaved: [InventoryMixedRow] {
        let rows =
            typed.map { InventoryMixedRow(id: $0.id, name: $0.name, untyped: nil, item: $0) }
            + untyped.map {
                InventoryMixedRow(id: $0.id, name: $0.item.name, untyped: $0, item: $0.item)
            }
        return rows.sorted { $0.name < $1.name }
    }
}

/// One row in a list that holds both kinds, so the two can be sorted together.
internal struct InventoryMixedRow: Identifiable {
    internal let id: String
    internal let name: String
    internal let untyped: InventoryUntypedItem?
    internal let item: InventoryFoundationItem

    @MainActor @ViewBuilder internal var view: some View {
        if let untyped {
            InventoryUntypedRow(entry: untyped)
        } else {
            InventoryItemRow(item: item)
        }
    }
}
