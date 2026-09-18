import DesignSystem
import SwiftUI

/// An item's actions as the sheet a long-press or a More button opens.
///
/// Grouped by what they change, with a group only when it has something in
/// it. Destructive styling is reserved for ``InventoryAction/Weight/irreversible``
/// (see ``InventoryAction`` for why discarding is not red).
internal struct InventoryActionList: View {
    internal let item: InventoryFoundationItem

    internal var body: some View {
        List {
            Section { InventoryItemRow(item: item) }
            InventoryActionSections(item: item)
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
    }
}

/// The sections of one item's sheet, so two items' actions can share a list.
internal struct InventoryActionSections: View {
    internal let item: InventoryFoundationItem
    @Environment(\.inventoryStyle) private var style

    internal var body: some View {
        let actions = InventoryAction.available(for: item, style: style)
        if actions.isEmpty {
            Section {
                Text("Nothing can be done to a destroyed item. Its history stays readable.")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        ForEach(InventoryAction.Heading.allCases, id: \.self) { heading in
            let members = actions.filter { $0.heading == heading }
            if !members.isEmpty {
                Section(heading.rawValue) {
                    ForEach(members) { InventoryActionButton(action: $0) }
                }
            }
        }
    }
}

/// One action, which asks first when it carries a confirmation.
///
/// The dialog is real: a reviewer taps "Break the seal" and is asked, which is
/// the entire difference between a sealed box and a closed one, and the thing
/// the close-or-seal experiment exists to let them feel.
internal struct InventoryActionButton: View {
    internal let action: InventoryAction
    @State private var isConfirming = false

    internal var body: some View {
        Button(role: action.weight == .irreversible ? .destructive : nil) {
            if action.confirmation != nil { isConfirming = true }
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Label {
                    Text(action.title)
                } icon: {
                    action.symbol.image
                }
                .font(.popsBody)
                .foregroundStyle(
                    action.weight == .irreversible ? Color.popsDestructive : Color.popsInventory
                )
                if let note = action.note {
                    Text(note)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        }
        .accessibilityHint(action.note ?? "")
        .confirmationDialog(
            action.confirmation ?? "", isPresented: $isConfirming, titleVisibility: .visible
        ) {
            Button(action.title, role: action.weight == .irreversible ? .destructive : nil) {}
            Button("Cancel", role: .cancel) {}
        }
    }
}
