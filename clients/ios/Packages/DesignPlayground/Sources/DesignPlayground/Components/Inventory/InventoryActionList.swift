import DesignSystem
import SwiftUI

/// An item's actions as the sheet a long-press or a More button opens.
///
/// Grouped by what they change, with a group only when it has something in
/// it. Destructive styling is reserved for ``InventoryAction/Weight/irreversible``
/// — see ``InventoryAction`` for why discarding is not red.
internal struct InventoryActionList: View {
    internal let item: InventoryFoundationItem
    @Environment(\.inventoryStyle) private var style

    internal var body: some View {
        let actions = InventoryAction.available(for: item, style: style)
        List {
            Section { InventoryItemRow(item: item) }
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
        .playgroundInsetGroupedList()
    }
}

internal struct InventoryActionButton: View {
    internal let action: InventoryAction

    internal var body: some View {
        Button(role: action.weight == .irreversible ? .destructive : nil) {
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Label(action.title, systemImage: action.symbol.system)
                    .font(.popsBody)
                if let note = action.note {
                    Text(note)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        }
        .accessibilityHint(action.note ?? "")
    }
}
