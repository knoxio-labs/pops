import DesignSystem
import SwiftUI

/// The first action a placement makes obvious: Pick up, Put back, Move, or
/// Restore, and then whatever the item's capabilities add. Reuses
/// ``InventoryAction/available(for:style:)`` rather than re-deriving when each
/// applies, so this page cannot disagree with the sheet the same item's
/// actions open into.
internal enum InventoryItemDetailPrimaryAction {
    /// Restore first, because it is the only thing an inactive item can do;
    /// then the placement verbs, in the order a person would reach for them.
    private static let priority = ["restore", "put-back", "pick-up", "move"]

    /// The ids a capability contributes to the action row, in ADR-001's
    /// order. Everything else an item can do is in the More menu: the row is
    /// what the thing in front of you is for, not a list of its verbs.
    private static let capabilityRow = ["reopen", "close", "put-in"]

    internal static func choose(
        for item: InventoryFoundationItem,
        style: InventoryFoundationStyle
    ) -> InventoryAction? {
        let actions = InventoryAction.available(for: item, style: style)
        for id in priority {
            if let match = actions.first(where: { $0.id == id }) { return match }
        }
        return actions.first
    }

    /// The whole row, primary first.
    internal static func row(
        for item: InventoryFoundationItem,
        style: InventoryFoundationStyle
    ) -> [InventoryAction] {
        let actions = InventoryAction.available(for: item, style: style)
        guard let first = choose(for: item, style: style) else { return [] }
        let placement = actions.filter { priority.contains($0.id) && $0.id != first.id }
        let capability = capabilityRow.compactMap { id in actions.first { $0.id == id } }
        return [first] + placement + capability
    }
}

/// The top of the page: the photographs, then the name, the code and the
/// state under them.
///
/// The picture is the header rather than a row inside one. It bleeds to the
/// top edge and the navigation bar's glass sits over it, which is where iOS 26
/// puts the functional layer, and what the HIG's layout guidance means by
/// extending content to fill the screen with the control layer on top of it
/// rather than beside it.
internal struct InventoryItemDetailHeader: View {
    internal let detail: InventoryItemDetail
    @Environment(\.inventoryStyle) private var style
    @ScaledMetric(relativeTo: .largeTitle) private var heroHeight = PopsSize.pageHeight * 1.5

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            hero
            identity
                .padding(.horizontal, PopsSpacing.lg)
        }
    }

    private var hero: some View {
        InventoryItemDetailHeroPhotos(photos: detail.photos, symbol: detail.item.symbol.system)
            .frame(height: heroHeight)
            .frame(maxWidth: .infinity)
            .clipped()
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(detail.item.name)
                .font(.popsTitle)
                .foregroundStyle(
                    detail.item.lifecycle.countsTowardTotals
                        ? Color.popsForeground : Color.popsMutedForeground
                )
                .strikethrough(detail.item.lifecycle == .destroyed)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: PopsSpacing.sm) {
                Text(detail.subtitle)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
                if let code = detail.item.code {
                    InventoryCodeBadge(code: code)
                }
                Spacer(minLength: PopsSpacing.xs)
                InventorySyncMarker(sync: detail.item.sync)
            }
            marks
        }
    }

    @ViewBuilder private var marks: some View {
        let marks = InventoryStateMark.marks(for: detail.item)
        if !marks.isEmpty {
            InventoryChipFlow(spacing: PopsSpacing.xs) {
                ForEach(marks) { InventoryStateBadge(mark: $0) }
            }
            .inventoryFadeIn()
        }
    }
}
