import DesignSystem
import SwiftUI

/// Where an in-hand item was before, and the one button that returns it
/// there.
///
/// Put back is a single tap even when the previous place is gone. The card
/// is what carries the difference. A current placement gets a plain button;
/// a stale one gets the button and a caveat; a deleted one gets no button at
/// all, because there is nowhere for it to press to.
internal struct InventoryPreviousPlacementCard: View {
    internal let retrieval: InventoryRetrievalItem
    internal let onPutBack: () -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Label {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text("Previous placement")
                        .font(.popsSectionLabel)
                        .foregroundStyle(Color.popsMutedForeground)
                    Text(destination)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                }
            } icon: {
                Image(systemName: InventorySymbol.restore.system)
                    .foregroundStyle(tone)
            }
            if let note = retrieval.statusNote {
                Text(note)
                    .font(.popsCaption)
                    .foregroundStyle(tone)
            }
            if InventoryRetrieval.canPutBack(retrieval) {
                Button("Put back", action: onPutBack)
                    .font(.popsSubheadline.weight(.semibold))
                    .playgroundGlassButton()
                    .tint(.popsInventory)
                    .accessibilityHint("Returns \(retrieval.item.name) to \(destination)")
            }
        }
        .padding(PopsSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                .fill(Color.popsSurface)
            RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                .stroke(tone, lineWidth: PopsBorder.hairline)
        }
        .accessibilityElement(children: .combine)
    }

    private var destination: String {
        guard case .inHand(let previous) = retrieval.item.placement, let previous else {
            return "Nowhere recorded"
        }
        return previous
    }

    private var tone: Color {
        switch retrieval.previousStatus {
        case .current: .popsInventory
        case .stale: .popsWarning
        case .deleted: .popsDestructive
        }
    }
}
