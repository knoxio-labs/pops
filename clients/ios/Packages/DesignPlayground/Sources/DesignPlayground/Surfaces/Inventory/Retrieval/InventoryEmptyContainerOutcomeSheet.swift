import DesignSystem
import SwiftUI

/// What happens to the box itself, once nothing is left inside it.
///
/// Asked only here, and only once everything really has left. Closing a
/// container that still holds items never reaches this, because closing and
/// being empty are unrelated facts (ADR-001).
internal struct InventoryEmptyContainerOutcomeSheet: View {
    internal let containerName: String
    /// Items that left the box without a destination. They are out, so the
    /// box is empty, but saying they have a new home would be untrue.
    internal var inHandCount: Int = 0
    internal let onChoose: (InventoryEmptyContainerChoice) -> Void
    @Environment(\.dismiss) private var dismiss

    private var message: String {
        inHandCount == 0
            ? "Everything that was inside has a new home."
            : "\(inHandCount) of them are still in hand, waiting for somewhere to go."
    }

    internal var body: some View {
        NavigationStack {
            List {
                Section {
                    PopsStatusHeader(
                        tone: inHandCount == 0 ? .success : .information,
                        title: "\(containerName) is empty",
                        message: message)
                }
                Section("What happens to the box?") {
                    ForEach(InventoryEmptyContainerChoice.allCases) { choice in
                        Button {
                            onChoose(choice)
                            dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                                Text(choice.title)
                                    .font(.popsHeadline)
                                    .foregroundStyle(Color.popsForeground)
                                Text(choice.detail)
                                    .font(.popsCaption)
                                    .foregroundStyle(Color.popsMutedForeground)
                            }
                        }
                    }
                }
            }
            .playgroundInsetGroupedList()
            .tint(.popsInventory)
            .navigationTitle("Empty container")
            .playgroundTitleDisplay(large: false)
        }
    }
}
