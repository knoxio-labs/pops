import DesignSystem
import SwiftUI

/// An item's inventory code, when it has one.
///
/// Monospaced because it is read character by character against a sticker,
/// and never truncated: a code with characters missing matches nothing, so a
/// long one takes its own line instead. Absent entirely on unlabelled items, ADR-001: most items do
/// not have a code, and a row that reserved space for one would say they do.
internal struct InventoryCodeBadge: View {
    internal let code: String

    internal var body: some View {
        HStack(spacing: PopsSpacing.xs) {
            Image(systemName: InventorySymbol.code.system)
                .font(.popsCaption)
            Text(code)
                .font(.popsMonospacedCaption)
                .lineLimit(1)
                .fixedSize()
        }
        .foregroundStyle(Color.popsMutedForeground)
        .padding(.horizontal, PopsSpacing.sm)
        .padding(.vertical, PopsSpacing.xs)
        .background(Color.popsMutedForeground.opacity(0.12), in: .capsule)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Inventory code \(code)")
    }
}

/// How many the record stands for, when that is not one.
internal struct InventoryQuantityBadge: View {
    internal let quantity: InventoryQuantity

    @ViewBuilder internal var body: some View {
        if let badge = quantity.badge {
            Text(badge)
                .font(.popsSubheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(quantity.count < 1 ? Color.popsWarning : Color.popsForeground)
                .accessibilityLabel(quantity.count < 1 ? "None left" : "\(quantity.count) of these")
        }
    }
}

/// A state worth telling the reader about, and how it is told.
///
/// Lifecycle shows only when it is not active; access shows on every
/// container, because open or closed is a container's primary fact. The two
/// are separate marks by design, ADR-001 forbids one badge for both.
internal struct InventoryStateMark: Identifiable, Equatable {
    internal let id: String
    internal let label: String
    internal let symbol: String
    /// Drawn in Inventory's colour at full strength. Only an open container is,
    /// because it is the one state that is work still in progress.
    internal let isHighlighted: Bool

    internal static func marks(for item: InventoryFoundationItem) -> [InventoryStateMark] {
        var marks: [InventoryStateMark] = []
        if let access = item.access {
            marks.append(
                InventoryStateMark(
                    id: "access",
                    label: accessLabel(access),
                    symbol: InventorySymbol.container(access).system,
                    isHighlighted: access == .open))
        }
        if item.lifecycle != .active {
            marks.append(
                InventoryStateMark(
                    id: "lifecycle",
                    label: lifecycleLabel(item.lifecycle),
                    symbol: lifecycleSymbol(item.lifecycle),
                    isHighlighted: false))
        }
        return marks
    }

    private static func accessLabel(_ access: InventoryAccess) -> String {
        switch access {
        case .open: "Open"
        case .closed: "Closed"
        case .sealed: "Sealed"
        }
    }

    private static func lifecycleLabel(_ lifecycle: InventoryLifecycle) -> String {
        switch lifecycle {
        case .active: "Active"
        case .retired: "Retired"
        case .discarded: "Discarded"
        case .lost: "Lost"
        case .destroyed: "Destroyed"
        }
    }

    private static func lifecycleSymbol(_ lifecycle: InventoryLifecycle) -> String {
        switch lifecycle {
        case .active: InventorySymbol.item.system
        case .retired: InventorySymbol.retired.system
        case .discarded: InventorySymbol.discard.system
        case .lost: InventorySymbol.lost.system
        case .destroyed: InventorySymbol.destroyed.system
        }
    }
}

/// One state mark drawn as a chip. An open container's is in Inventory's
/// colour at full strength; everything else is quiet.
internal struct InventoryStateBadge: View {
    internal let mark: InventoryStateMark

    internal var body: some View {
        Text(mark.label)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(tone)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .background(tone.opacity(0.14), in: .capsule)
    }

    private var tone: Color { mark.isHighlighted ? .popsInventory : .popsMutedForeground }
}

/// The sync mark, shown only for the tiers the style lets through.
internal struct InventorySyncMarker: View {
    internal let sync: InventorySync
    @Environment(\.inventoryStyle) private var style

    @ViewBuilder internal var body: some View {
        if style.syncVisibility.shows(sync) {
            Image(systemName: symbol.system)
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(tone)
                .symbolEffect(.pulse, isActive: sync == .synchronizing)
                .accessibilityLabel(sync.label)
        }
    }

    private var symbol: InventorySymbol {
        switch sync {
        case .saved, .synchronized: .synced
        case .queued, .synchronizing: .queued
        case .stale: .stale
        case .needsAttention: .attention
        }
    }

    private var tone: Color {
        switch sync.prominence {
        case .silent, .quiet: .popsMutedForeground
        case .visible: .popsWarning
        case .urgent: .popsDestructive
        }
    }
}
