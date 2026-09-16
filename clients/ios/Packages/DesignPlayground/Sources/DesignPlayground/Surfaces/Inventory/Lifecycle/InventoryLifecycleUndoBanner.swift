import DesignSystem
import SwiftUI

/// What a reversible action leaves behind when it does not ask first: a
/// short window where undoing it costs one tap rather than a trip back
/// through Restore.
///
/// Distinct from ``InventoryLifecycleDispositionSummary``'s "can be
/// restored" line, that is permanent and reachable from the item at any
/// time; this is transient, and belongs to the moment right after the tap.
internal struct InventoryLifecycleUndoBanner: View {
    internal let subject: String
    internal let verb: String

    internal var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            Image(systemName: InventorySymbol.discard.system)
                .foregroundStyle(Color.popsMutedForeground)
            Text("\(verb) \(subject).")
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
            Spacer(minLength: PopsSpacing.sm)
            Button("Undo") {}
                .font(.popsSubheadline.weight(.semibold))
                .foregroundStyle(Color.popsInventory)
        }
        .accessibilityElement(children: .combine)
    }
}

/// "Recently changed": the same undo, offered again for anything changed in
/// the last little while rather than only the one just tapped.
internal struct InventoryLifecycleRecentlyChangedRow: View {
    internal let event: InventoryTimelineEvent

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("\(event.verb) \(event.subject)")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Text(event.when)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Button("Undo") {}
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsInventory)
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }
}
