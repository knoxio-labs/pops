import DesignSystem
import SwiftUI

/// The canonical row for anything in the catalogue — item or container.
///
/// One row for both, because a container is an item (ADR-001); what differs
/// is the mark and the access state, and both are driven by the item rather
/// than by picking a different view. Every open question in POPS-3979 that is
/// about a row reaches it through ``InventoryFoundationStyle`` rather than a
/// parameter, so a screen cannot answer one of them by accident.
internal struct InventoryItemRow: View {
    internal let item: InventoryFoundationItem
    @Environment(\.inventoryStyle) private var style

    internal var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            InventoryItemMark(item: item)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                titleLine
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                accessories
            }
            Spacer(minLength: PopsSpacing.sm)
            VStack(alignment: .trailing, spacing: PopsSpacing.xs) {
                InventoryQuantityBadge(quantity: item.quantity)
                InventorySyncMarker(sync: item.sync)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    private var marks: [InventoryStateMark] { InventoryStateMark.marks(for: item) }

    private var titleLine: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.xs) {
            Text(item.name)
                .font(.popsHeadline)
                .foregroundStyle(
                    item.lifecycle.countsTowardTotals
                        ? Color.popsForeground : Color.popsMutedForeground
                )
                .strikethrough(item.lifecycle == .destroyed)
            if style.stateTreatment == .icon || style.stateTreatment == .combined {
                ForEach(marks) { mark in
                    Image(systemName: mark.symbol)
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(
                            mark.isWarning ? Color.popsWarning : Color.popsMutedForeground
                        )
                        .accessibilityLabel(mark.label)
                }
            }
        }
    }

    /// Type, then where it is, then — when the style says so — its state in
    /// words. An untyped item says so rather than leaving a gap, because
    /// "no type yet" is the state POPS-4016 has to make findable.
    private var detail: String {
        var parts = [
            item.typeName ?? "No type yet",
            item.placement.summary(inHandTerm: style.inHandTerm.rawValue),
        ]
        if style.stateTreatment == .subtitle || style.stateTreatment == .combined {
            parts += marks.map(\.label)
        }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private var accessories: some View {
        let showsBadges = style.stateTreatment == .badge && !marks.isEmpty
        if showsBadges || item.code != nil {
            InventoryChipFlow(spacing: PopsSpacing.xs) {
                if showsBadges {
                    ForEach(marks) { InventoryStateBadge(mark: $0) }
                }
                if let code = item.code {
                    InventoryCodeBadge(code: code)
                }
            }
        }
    }
}

/// The glyph at the head of a row, in the shape the style gives containers.
internal struct InventoryItemMark: View {
    internal let item: InventoryFoundationItem
    @Environment(\.inventoryStyle) private var style
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    internal var body: some View {
        Image(systemName: item.symbol.system)
            .font(.popsHeadline)
            .foregroundStyle(tone)
            .frame(width: size, height: size)
            .background(tone.opacity(0.14), in: shape)
            .accessibilityHidden(true)
    }

    private var distinguishes: Bool {
        item.isContainer && style.containerMark != .likeAnItem
    }

    private var tone: Color { distinguishes ? .popsAccent : .popsMutedForeground }

    private var shape: AnyShape {
        item.isContainer && style.containerMark == .squared
            ? AnyShape(RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous))
            : AnyShape(Circle())
    }
}
