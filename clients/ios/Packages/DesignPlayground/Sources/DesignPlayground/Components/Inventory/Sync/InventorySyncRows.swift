import DesignSystem
import SwiftUI

/// The dashboard's row idiom for one sync line: the record's photo or a
/// glyph, a name over one caption, and whatever the row says on its trailing
/// edge.
internal struct InventorySyncRowLabel<Caption: View, Trailing: View>: View {
    private let recordID: String?
    private let symbol: InventorySymbol
    private let title: String?
    private let caption: Caption
    private let trailing: Trailing

    internal init(
        recordID: String?,
        symbol: InventorySymbol,
        title: String? = nil,
        @ViewBuilder caption: () -> Caption,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.recordID = recordID
        self.symbol = symbol
        self.title = title
        self.caption = caption()
        self.trailing = trailing()
    }

    private var record: InventorySearchRecord? {
        recordID.flatMap(InventorySearchFixtures.record(id:))
    }

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryRecordMark(
                photo: record?.photo, symbol: record?.item.symbol.system ?? symbol.system)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(title ?? record?.item.name ?? "")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                caption
            }
            Spacer(minLength: PopsSpacing.sm)
            trailing
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
    }
}

/// One change waiting to sync: quiet, with a thin bar while it is sent.
internal struct InventoryWaitingRow: View {
    internal let operation: InventoryQueuedOperation

    internal var body: some View {
        InventorySyncRowLabel(
            recordID: operation.recordID, symbol: operation.symbol, title: operation.title
        ) {
            Text(operation.detail)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            if let progress = operation.progress {
                ProgressView(value: progress)
                    .tint(Color.popsInventory)
                    .accessibilityLabel(InventorySync.synchronizing.label)
            }
        } trailing: {
            InventorySyncMarker(sync: operation.progress == nil ? .queued : .synchronizing)
        }
        .accessibilityElement(children: .combine)
    }
}

/// One repair: what happened in one line, and its one fix as an amber icon.
internal struct InventoryRepairListRow: View {
    internal let repair: InventoryRepair
    internal let onFix: () -> Void

    internal var body: some View {
        InventorySyncRowLabel(
            recordID: repair.recordID, symbol: .item
        ) {
            Label {
                Text(repair.problem)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                InventorySymbol.attention.image
                    .foregroundStyle(Color.popsDestructive)
            }
            .font(.popsCaption)
            .labelStyle(InventorySyncCaptionLabelStyle())
        } trailing: {
            Button(action: onFix) {
                repair.kind.fix.symbol.image
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsInventory)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(repair.kind.fix.title)
        }
    }
}

/// A repair that was settled, and what it settled on.
internal struct InventoryResolvedRow: View {
    internal let entry: InventoryResolvedEntry

    internal var body: some View {
        InventorySyncRowLabel(recordID: entry.recordID, symbol: .item) {
            Text("\(entry.outcome) · \(entry.when)")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        } trailing: {
            InventorySymbol.resolved.image
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityLabel("Resolved")
        }
        .accessibilityElement(children: .combine)
    }
}

/// A caption's glyph and text on one baseline, closer than a list label's.
private struct InventorySyncCaptionLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.xs) {
            configuration.icon
            configuration.title
        }
    }
}
