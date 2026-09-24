import DesignSystem
import SwiftUI

/// What a `catalogueChanged` repair's change carried, one field per row, each
/// marked against the fields this phone has now: a quiet tick where the value
/// still fits, and the mark and word for what moved where it does not.
internal struct InventoryCatalogueRepairDetails: View {
    internal let title: String
    internal let values: [InventoryQueuedValue]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryGroundedSectionHeader(title: title)
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(values) { value in
                        InventoryQueuedValueRow(value: value)
                        if value.id != values.last?.id { PopsDivider() }
                    }
                }
            }
        }
    }
}

/// One field of a queued change: its name over the value it carried, struck
/// through when it no longer fits, and how it stands now on the trailing edge.
internal struct InventoryQueuedValueRow: View {
    internal let value: InventoryQueuedValue

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(value.field)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                Text(value.value)
                    .font(.popsHeadline)
                    .foregroundStyle(
                        value.fit.blocks ? Color.popsMutedForeground : Color.popsForeground
                    )
                    .strikethrough(value.fit.blocks, color: .popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: PopsSpacing.sm)
            mark
        }
        .frame(minHeight: PopsSize.touchTarget)
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value.field), \(value.value)")
        .accessibilityValue(value.fit.caption ?? "Fits")
    }

    private var mark: some View {
        HStack(spacing: PopsSpacing.xs) {
            if let caption = value.fit.caption { Text(caption) }
            value.fit.symbol.image
        }
        .font(.popsCaption.weight(.semibold))
        .foregroundStyle(value.fit.blocks ? tint : Color.popsMutedForeground)
    }

    /// Red for what stops the change, amber for what is only on its way.
    private var tint: Color {
        value.fit == .notOnPhone ? .popsWarning : .popsDestructive
    }
}
