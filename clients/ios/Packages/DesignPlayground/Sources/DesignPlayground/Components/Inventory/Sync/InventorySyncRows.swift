import DesignSystem
import SwiftUI

/// One queued change, as the queue shows it.
///
/// Reads as something that happened, not something being attempted: the verb
/// is past tense because on this phone it is already true. The mark on the
/// right says where it is in the run, and a held change says what it is held
/// behind rather than wearing a failure that is not its own.
internal struct InventoryQueuedRow: View {
    internal let operation: InventoryQueuedOperation

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(operation.title)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Image(systemName: symbol.system)
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(tone)
                .symbolEffect(.pulse, isActive: operation.progress == .sending)
                .accessibilityLabel(progressLabel)
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    private var detail: String {
        var parts = [operation.detail]
        if operation.photoCount > 0 {
            parts.append("\(operation.photoCount) photos on this phone")
        }
        if operation.progress == .held {
            parts.append("waiting on an earlier change")
        }
        return parts.joined(separator: " · ")
    }

    private var symbol: InventorySymbol {
        switch operation.progress {
        case .waiting, .sending: .queued
        case .held: .held
        case .needsAttention: .attention
        case .done: .synced
        }
    }

    private var tone: Color {
        switch operation.progress {
        case .waiting, .sending, .held, .done: .popsMutedForeground
        case .needsAttention: .popsDestructive
        }
    }

    private var progressLabel: String {
        switch operation.progress {
        case .waiting: "Waiting to sync"
        case .sending: "Syncing"
        case .held: "Held behind an earlier change"
        case .needsAttention: "Needs attention"
        case .done: "Synced"
        }
    }
}

/// A disagreement that settled itself, and what it settled on.
internal struct InventoryResolvedEntry: Identifiable, Equatable {
    internal let title: String
    internal let outcome: String
    internal let when: String

    internal var id: String { title }
}

/// One settled disagreement, as the history shows it.
///
/// Kept visible because automatic reconciliation a person cannot inspect is
/// indistinguishable from data quietly changing under them.
internal struct InventoryResolvedRow: View {
    internal let entry: InventoryResolvedEntry

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
            Image(systemName: InventorySymbol.resolved.system)
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsSuccess)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(entry.title)
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsForeground)
                Text("\(entry.outcome) · \(entry.when)")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }
}

extension InventoryRepairRow {
    /// The foundation's repair row, driven by the conflict model rather than
    /// by three strings a screen assembled.
    ///
    /// Same row, same three obligations, which item, what disagreed, one
    /// resolution, now answered from the one place that knows what a kind of
    /// disagreement offers.
    internal init(conflict: InventoryConflict) {
        self.init(
            item: conflict.item,
            problem: conflict.summary,
            resolution: conflict.leading?.title ?? conflict.kind.headline)
    }
}

/// What a queue is doing, in one line, above the rows that say it in detail.
internal struct InventoryQueueSummary: View {
    internal let operations: [InventoryQueuedOperation]

    internal var body: some View {
        Text(sentence)
            .font(.popsSubheadline)
            .foregroundStyle(Color.popsMutedForeground)
    }

    private var sentence: String {
        let pending = operations.filter { $0.progress != .done }
        guard !pending.isEmpty else { return "Everything on this phone has reached POPS." }
        let photos = InventoryQueue.stagedPhotoCount(in: operations)
        let changes = "\(pending.count) changes saved on this phone"
        return photos == 0 ? "\(changes)." : "\(changes), carrying \(photos) photos."
    }
}
