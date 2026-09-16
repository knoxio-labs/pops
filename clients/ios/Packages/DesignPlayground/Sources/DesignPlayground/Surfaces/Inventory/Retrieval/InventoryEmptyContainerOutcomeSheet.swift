import DesignSystem
import SwiftUI

/// What happens to the box itself, once nothing is left inside it.
///
/// Asked only here, and only once everything really has left. Closing a
/// container that still holds items never reaches this, because closing and
/// being empty are unrelated facts (ADR-001).
internal struct InventoryEmptyContainerOutcomeSheet: View {
    internal let containerName: String
    internal let onChoose: (InventoryEmptyContainerChoice) -> Void
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List {
                Section {
                    PopsStatusHeader(
                        tone: .success,
                        title: "\(containerName) is empty",
                        message: "Everything that was inside has a new home.")
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
