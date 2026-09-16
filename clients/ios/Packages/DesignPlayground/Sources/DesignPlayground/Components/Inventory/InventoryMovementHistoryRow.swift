import DesignSystem
import SwiftUI

/// One retrieval or unpacking move, said as where it went from and to.
///
/// A movement is the one activity row that has two places rather than one, so
/// it earns its own shape instead of squeezing both into
/// ``InventoryActivityRow``'s single detail line. Undo is offered here rather
/// than behind a swipe because move-day history is read as a list of things
/// that might need reversing, not skimmed the way ordinary activity is.
internal struct InventoryMovementHistoryRow: View {
    internal let subject: String
    internal let from: String
    internal let to: String
    internal let when: String
    internal let onUndo: () -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                Image(systemName: InventorySymbol.move.system)
                    .font(.popsCaption.weight(.semibold))
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(subject)
                        .font(.popsBody)
                        .foregroundStyle(Color.popsForeground)
                    path
                    Text(when)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Spacer(minLength: PopsSpacing.sm)
            }
            Button("Undo", action: onUndo)
                .font(.popsCaption.weight(.semibold))
                .tint(.popsInventory)
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    private var path: some View {
        HStack(spacing: PopsSpacing.xs) {
            Text(from)
            Image(systemName: "chevron.forward")
                .font(.popsCaption.weight(.semibold))
            Text(to)
        }
        .font(.popsCaption)
        .foregroundStyle(Color.popsMutedForeground)
    }
}
