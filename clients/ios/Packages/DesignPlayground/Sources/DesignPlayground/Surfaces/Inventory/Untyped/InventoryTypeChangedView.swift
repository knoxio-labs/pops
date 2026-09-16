import DesignSystem
import SwiftUI

/// A type that gained a field under the items already on it.
///
/// The migration answers this on the server: fourteen rows gain a column and
/// it is empty. What the phone shows is a separate decision, and it is the one
/// a person lives with. Three answers, differing in whether a deploy is
/// allowed to create work.
internal struct InventoryTypeChangedView: View {
    @Environment(\.inventoryUntypedStyle) private var style
    private let change = InventoryUntypedFixtures.boxChange

    /// Two of the fourteen. A sealed one is deliberately not among them:
    /// sealing only exists while POPS-3979's last question is open, and this
    /// screen must not answer it in passing.
    private var boxes: [InventoryFoundationItem] {
        [InventoryFoundationFixtures.kitchenBox, InventoryFoundationFixtures.linenBox]
    }

    internal var body: some View {
        List {
            if style.typeChange != .onTheItem { banner }
            Section {
                ForEach(boxes) { item in
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        InventoryItemRow(item: item)
                        InventoryPropertyLine(
                            key: change.addedField, value: fieldValue, tone: .popsMutedForeground)
                    }
                }
            } header: {
                Text(listHeader)
            } footer: {
                Text(listFooter)
            }
            Section {
                ForEach(change.type.fieldNames, id: \.self) { field in
                    InventoryPropertyLine(
                        key: field,
                        value: field == change.addedField ? "New in 2.4" : "Since 1.0",
                        tone: field == change.addedField ? .popsInventory : .popsMutedForeground)
                }
            } header: {
                Text("What Storage box asks for now")
            } footer: {
                InventoryTypeSourceNote(
                    "The field was added in code and shipped. Nothing on the phone added it and "
                        + "nothing on the phone can take it away.")
            }
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }

    private var banner: some View {
        Section {
            PopsStatusHeader(
                tone: style.typeChange == .reviewQueue ? .warning : .information,
                title: "Storage box asks one more thing",
                message: bannerMessage,
                caption: "\(change.itemsAffected) items are on this type")
        }
    }

    private var bannerMessage: String {
        switch style.typeChange {
        case .announced:
            "Fragile arrived in 2.4 and is empty on all 14. Said once; nothing is tracking it "
                + "after this."
        case .onTheItem:
            ""
        case .reviewQueue:
            "Fragile arrived in 2.4 and is empty on all 14. They are queued as work, in the same "
                + "list as things waiting for a type."
        }
    }

    private var fieldValue: String {
        style.typeChange == .reviewQueue ? "Needs an answer" : "Empty"
    }

    private var listHeader: String {
        style.typeChange == .reviewQueue ? "Queued · 14" : "On Storage box · 14"
    }

    private var listFooter: String {
        switch style.typeChange {
        case .announced:
            "Each box shows the new field empty when it is opened. The announcement above is the "
                + "only time the change is mentioned."
        case .onTheItem:
            "Nothing announced the change. A new field appears empty on the item, the same as any "
                + "field nobody has filled in."
        case .reviewQueue:
            "Answering all 14 is offered as a run, so a change that arrived by deploy can be "
                + "cleared the way a batch of arrivals is."
        }
    }
}
