import DesignSystem
import SwiftUI

/// A lifecycle action that did not go through, said the way
/// ``InventoryRepairRow`` says a sync conflict: what was tried, why it could
/// not happen, and the one thing to do about it.
internal struct InventoryLifecycleRejectionRow: View {
    internal let rejection: InventoryLifecycleRejection

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                Image(systemName: InventorySymbol.attention.system)
                    .foregroundStyle(Color.popsWarning)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text("Can't \(rejection.attempted.lowercased()) \(rejection.item.name)")
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text(rejection.reason)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            Button(rejection.nextStep) {}
                .font(.popsSubheadline.weight(.semibold))
                .playgroundGlassButton()
                .tint(.popsInventory)
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}

/// What happens once the last thing leaves a container: nothing forces a
/// decision about the box itself, and this is where one is offered.
internal struct InventoryLifecycleContainerEmptyOutcome: View {
    internal let container: InventoryFoundationItem

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text("\(container.name) is empty")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            Text("Nothing is left inside. It still exists as a record of its own.")
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
            HStack(spacing: PopsSpacing.sm) {
                Button("Keep as a box") {}
                    .font(.popsSubheadline.weight(.semibold))
                    .playgroundGlassButton()
                    .tint(.popsInventory)
                Button("Retire it") {}
                    .font(.popsSubheadline.weight(.semibold))
                    .playgroundGlassButton()
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }
}
