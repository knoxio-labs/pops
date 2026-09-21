import DesignSystem
import SwiftUI

/// How far pressing Save has got.
///
/// One Save, but not one write. POPS-3646 creates each purchase from its own
/// draft, so a batch of three is three calls and can stop after two. The
/// screen cannot pretend a batch saves or fails as a unit, so it does the next
/// most honest thing: whatever was written is final and leaves the batch, and
/// the one refused is put on screen with the reason over it.
internal enum ReviewSaving: Hashable, Sendable {
    case idle
    /// Writing. `done` of the batch are already created.
    case saving(done: Int)
    /// Stopped at `id`. `retryable` is whether pressing Save again could
    /// possibly get past it.
    case failed(id: String, reason: String, retryable: Bool)

    internal var isInFlight: Bool {
        if case .saving = self { return true }
        return false
    }

    internal var failedID: String? {
        if case .failed(let id, _, _) = self { return id }
        return nil
    }

    /// A refusal no retry gets past, such as the paper already being a
    /// purchase, holds Save until that one is discarded. A Try again that
    /// sends the batch into the same refusal is a button that cannot work.
    internal var blocksSave: Bool {
        if case .failed(_, _, let retryable) = self { return !retryable }
        return false
    }

    /// Why the save stopped, shown over the refused purchase and only that one.
    internal func notice(for id: String) -> String? {
        guard case .failed(let failed, let reason, _) = self, failed == id else { return nil }
        return reason
    }

    /// What the navigation bar's Save says.
    ///
    /// After a retryable refusal it is Try again rather than Save, because the
    /// retry resends the purchase that was refused and nothing else: what was
    /// written has left the batch, so a second press cannot create it twice.
    internal func saveTitle(count: Int) -> String {
        switch self {
        case .failed(_, _, true): "Try again"
        case .idle, .saving, .failed: count == 1 ? "Save" : "Save all \(count)"
        }
    }

    internal static func saved(_ count: Int) -> String {
        "\(count) saved"
    }

    internal static func alreadySaved(_ count: Int) -> String {
        count == 1 ? "1 is saved and stays saved." : "\(count) are saved and stay saved."
    }
}

/// Which purchases are still the batch's to save.
internal enum ReviewBatch {
    /// Everything not discarded, minus the `written` an earlier attempt
    /// created.
    ///
    /// Saving walks the batch in order, so the written ones are always the
    /// first of whatever was not discarded. That is why discarding is refused
    /// while a save is in flight: a discard mid-walk would change which rows
    /// "the first two" means.
    internal static func remaining<Entry: Identifiable>(
        _ entries: [Entry], discarded: Set<String>, written: Int
    ) -> [Entry] where Entry.ID == String {
        Array(entries.filter { !discarded.contains($0.id) }.dropFirst(written))
    }

    /// The purchases holding Save, in batch order: a flagged reading nobody
    /// has put on screen yet, or a draft that cannot be saved as it stands.
    ///
    /// Only flagged readings are gated on being seen. Asking somebody to page
    /// through eleven clean receipts to unlock a button trains them to page
    /// without looking; the ones the gate could not reconcile are where a
    /// human's eye is the only thing that settles it. "Seen" is not "read",
    /// and this does not pretend otherwise.
    internal static func holding(
        _ ids: [String], flagged: Set<String>, seen: Set<String>, saveable: Set<String>
    ) -> [String] {
        ids.filter { (flagged.contains($0) && !seen.contains($0)) || !saveable.contains($0) }
    }
}

/// Why a save stopped, pinned under the navigation bar.
///
/// Not the form's status banner: the review form shows complaints as hints
/// only, so a refusal handed to it was drawn nowhere. It is the one danger
/// tone in the flow, because it is the one thing that went wrong.
internal struct PurchaseSaveNotice: View {
    internal let reason: String

    internal var body: some View {
        Label {
            Text(reason)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "exclamationmark.octagon.fill")
                .foregroundStyle(Color.popsDestructive)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(PopsSpacing.md)
        .background(
            Color.popsDestructive.opacity(0.12), in: .rect(cornerRadius: PopsRadius.card)
        )
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.bottom, PopsSpacing.sm)
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// How much of a save has been written, as a bar that fills.
///
/// Determinate because the count is known: one write per purchase, and each
/// one landing is a step somebody can watch.
internal struct PurchaseSaveProgress: View {
    internal let done: Int
    internal let total: Int

    internal var body: some View {
        ProgressView(value: Double(done), total: Double(max(total, 1)))
            .progressViewStyle(.linear)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.sm)
            .accessibilityLabel("Saving \(min(done + 1, total)) of \(total)")
            .transition(.opacity)
    }
}
