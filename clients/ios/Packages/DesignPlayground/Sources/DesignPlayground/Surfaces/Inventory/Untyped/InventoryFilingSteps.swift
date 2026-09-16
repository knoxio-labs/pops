import DesignSystem
import SwiftUI

/// The type search, failing.
///
/// The screen the whole ticket turns on. A picker with nothing suitable in it
/// is ordinarily a dead end, and the one thing that must not happen here is
/// that the reader goes looking for the button that makes a type. So the
/// failure is stated, the two real ways forward are offered as a choice, and
/// where types come from is said rather than implied.
internal struct InventoryFilingTypeSearchView: View {
    @State private var query = "bag"

    internal var body: some View {
        List {
            Section {
                TextField("Search types", text: $query)
                    .font(.popsBody)
                    .frame(minHeight: PopsSize.touchTarget)
            } footer: {
                Text("No type matches \u{201C}\(query)\u{201D}.")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsInventory)
            }
            Section {
                InventoryUntypedChoiceRow(
                    title: "File it without a type",
                    detail: "Name, photo, where it is and a note. It is counted and findable.",
                    symbol: .item, isPreferred: true)
                InventoryUntypedChoiceRow(
                    title: "Keep it untyped for good",
                    detail: "For a one-off nothing will ever share. It stops waiting.",
                    symbol: .label, isPreferred: false)
            } header: {
                Text("What to do instead")
            } footer: {
                InventoryTypeSourceNote()
            }
            Section("Every type there is") {
                ForEach(InventoryUntypedFixtures.existingTypeNames, id: \.self) { name in
                    Text(name)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                }
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }
}

/// The note, holding what a type would have asked for.
///
/// Shown as a finished note beside the questions a Bag type would have asked,
/// so the cost of the decision is legible: the facts are all there, and none
/// of them can be searched as a value or compared between two bags.
internal struct InventoryFilingNoteView: View {
    private let entry = InventoryUntypedFixtures.canvasBag

    internal var body: some View {
        List {
            Section { InventoryItemRow(item: entry.item) }
            Section {
                Text(entry.note)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            } header: {
                Text("Note")
            } footer: {
                Text("Search finds these words. Nothing can ask for bags over 30 cm.")
            }
            Section {
                ForEach(InventoryUntypedFixtures.bagType.fieldNames, id: \.self) { field in
                    InventoryPropertyLine(
                        key: field, value: "Would be asked", tone: .popsMutedForeground)
                }
            } header: {
                Text("What a type would have asked")
            } footer: {
                InventoryTypeSourceNote(
                    "The Bag type's four fields, which ship in 2.4. Until then this section is "
                        + "here to be read rather than filled in.")
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }
}

/// Filed, and what happens next.
///
/// The confirmation carries the one thing the person cannot see from the row:
/// whether anything is going to chase this. That answer is the queue question,
/// so it is the style's to give.
internal struct InventoryFilingFiledView: View {
    @Environment(\.inventoryUntypedStyle) private var style
    @State private var keepUntyped = false

    internal var body: some View {
        List {
            Section {
                PopsStatusHeader(
                    tone: .information, title: "Filed without a type", message: outcome)
            }
            Section {
                InventoryUntypedRow(entry: InventoryUntypedFixtures.canvasBag, showsNote: true)
            }
            Section {
                Toggle("Nothing will ever share this", isOn: $keepUntyped)
                    .font(.popsBody)
            } footer: {
                Text(
                    "Takes it out of the waiting list without giving it a type. Reversible, and "
                        + "the only exit that is not an app update.")
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    private var outcome: String {
        switch style.queue {
        case .counted:
            "It joins the 11 things waiting for a type. Nothing else is needed from you."
        case .filterOnly:
            "Nothing is tracking it. Browse filtered by \u{201C}no type\u{201D} is how it is found again."
        case .onArrival:
            "Nothing is tracking it. It surfaces if an update adds a type that covers it."
        }
    }
}
