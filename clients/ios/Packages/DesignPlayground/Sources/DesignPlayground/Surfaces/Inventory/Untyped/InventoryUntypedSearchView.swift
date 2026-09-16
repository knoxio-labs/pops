import DesignSystem
import SwiftUI

/// One search, spanning typed and untyped items.
///
/// Words find both, because a name and a note are words either way. A
/// condition on a field cannot, and that is the honest cost of the decision:
/// the screen says how many items the condition could not judge rather than
/// quietly returning fewer.
internal struct InventoryUntypedSearchView: View {
    @Environment(\.inventoryUntypedStyle) private var style
    @State private var query = "garage"

    private var typed: [InventoryFoundationItem] {
        [
            InventoryFoundationFixtures.screws, InventoryFoundationFixtures.tape,
            InventoryFoundationFixtures.drill,
        ]
    }

    private var untyped: [InventoryUntypedItem] {
        [
            InventoryUntypedFixtures.bikePump, InventoryUntypedFixtures.curtainRail,
            InventoryUntypedFixtures.paintTin, InventoryUntypedFixtures.stepLadder,
        ]
    }

    internal var body: some View {
        List {
            Section {
                TextField("Search", text: $query)
                    .font(.popsBody)
                    .frame(minHeight: PopsSize.touchTarget)
            } footer: {
                Text("7 items. 3 on a type, 4 without one.")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            results
            conditionSection
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    @ViewBuilder private var results: some View {
        if style.listPresence == .grouped {
            Section("On a type") { ForEach(typed) { InventoryItemRow(item: $0) } }
            Section("No type yet") { ForEach(untyped) { InventoryUntypedRow(entry: $0) } }
        } else {
            Section {
                ForEach(typed) { InventoryItemRow(item: $0) }
                ForEach(untyped) { InventoryUntypedRow(entry: $0) }
            } footer: {
                Text("Ranked by where the word was found: the name, then the note.")
            }
        }
    }

    /// The part a word search cannot do, said before somebody tries it.
    private var conditionSection: some View {
        Section {
            InventoryPropertyProblem(
                message: "Length over 2 m skips 11 items",
                resolution:
                    "A condition reads a field, and an item with no type has none. They are "
                    + "excluded rather than judged as failing it.",
                tone: .popsInventory)
        } header: {
            Text("Adding a condition")
        }
    }
}

/// An item the moment a type arrives for it, and the question of whether being
/// half answered is a state at all.
///
/// Both variants draw the same item on the same new type with none of its four
/// fields answered. What differs is whether the product counts that.
internal struct InventoryPartialTypingView: View {
    @Environment(\.inventoryUntypedStyle) private var style
    private let type = InventoryUntypedFixtures.bagType
    private let entry = InventoryUntypedFixtures.canvasBag

    internal var body: some View {
        List {
            Section { InventoryItemRow(item: entry.item) }
            Section {
                LabeledContent("Type", value: type.name)
                if style.typing == .partial {
                    LabeledContent("Answered") {
                        Text("0 of 4").foregroundStyle(Color.popsInventory)
                    }
                }
            } header: {
                Text("Type")
            } footer: {
                Text(typeFooter)
            }
            Section {
                ForEach(type.fieldNames, id: \.self) { field in
                    InventoryPropertyLine(
                        key: field, value: emptyValue, tone: .popsMutedForeground)
                }
            } header: {
                Text("Fields")
            } footer: {
                Text(fieldsFooter)
            }
            Section {
                Text(entry.note).font(.popsBody).foregroundStyle(Color.popsForeground)
            } header: {
                Text("Note")
            } footer: {
                Text("Kept exactly as it was. Gaining a type moves nothing out of the note.")
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    private var emptyValue: String {
        style.typing == .partial ? "Unanswered" : "Not recorded"
    }

    private var typeFooter: String {
        switch style.typing {
        case .binary:
            "On the Bag type since 2.4. An empty field is a field nobody has filled in, which is "
                + "an ordinary thing for a field to be."
        case .partial:
            "On the Bag type since 2.4, and counted as partly filled until every field is answered."
        }
    }

    private var fieldsFooter: String {
        switch style.typing {
        case .binary:
            "Nothing counts these or chases them. A search for bags finds this one either way."
        case .partial:
            "A partly filled item appears in its own list, so the fields a type added can be "
                + "worked through rather than found one at a time."
        }
    }
}
