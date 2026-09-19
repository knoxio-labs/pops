import AppCore
import DesignSystem
import SwiftUI

/// The Sync page's row idiom: the record's photo or a glyph, a name over one
/// caption, and whatever the row says on its trailing edge. Shared by every
/// list this page draws, the way `InventoryGroundedRowLabel` is shared by the
/// dashboard's.
internal struct InventorySyncRowLabel<Trailing: View>: View {
    internal let display: InventorySyncEntityDisplay
    internal let caption: String
    internal let loadPhoto: @MainActor (String) async -> Data?
    internal let trailing: Trailing

    internal init(
        display: InventorySyncEntityDisplay, caption: String,
        loadPhoto: @escaping @MainActor (String) async -> Data?,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.display = display
        self.caption = caption
        self.loadPhoto = loadPhoto
        self.trailing = trailing()
    }

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryRecordMark(photo: display.photo, symbol: display.symbol, load: loadPhoto)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(display.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(caption)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: PopsSpacing.sm)
            trailing
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
    }
}

/// One change waiting to sync: quiet, with a thin bar while it is sent.
internal struct InventorySyncWaitingRowView: View {
    internal let row: InventorySyncWaitingRow
    internal let loadPhoto: @MainActor (String) async -> Data?

    internal var body: some View {
        InventorySyncRowLabel(display: row.display, caption: row.detail, loadPhoto: loadPhoto) {
            VStack(alignment: .trailing, spacing: PopsSpacing.xs) {
                InventorySyncMarker(sync: row.progress == nil ? .queued : .synchronizing)
                if let progress = row.progress {
                    ProgressView(value: progress)
                        .tint(Color.popsInventory)
                        .frame(width: PopsSize.touchTarget * 2)
                        .accessibilityLabel(InventorySync.synchronizing.label)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// One repair: what happened in one line, and its one fix as an amber icon.
internal struct InventorySyncRepairRowView: View {
    internal let row: InventorySyncRepairRow
    internal let loadPhoto: @MainActor (String) async -> Data?
    internal let onFix: () -> Void

    internal var body: some View {
        InventorySyncRowLabel(display: row.display, caption: row.problem, loadPhoto: loadPhoto) {
            Button(action: onFix) {
                row.repair.kind.fix.symbol.image
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsWarning)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(row.repair.kind.fix.title)
        }
    }
}

/// A repair that was settled, and what it settled on.
internal struct InventorySyncResolvedRowView: View {
    internal let row: InventorySyncResolvedRow
    internal let loadPhoto: @MainActor (String) async -> Data?

    internal var body: some View {
        InventorySyncRowLabel(
            display: row.display, caption: row.entry.outcome, loadPhoto: loadPhoto
        ) {
            InventorySymbol.resolved.image
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityLabel("Resolved")
        }
        .accessibilityElement(children: .combine)
    }
}
