import DesignSystem
import FeatureReceiptCapture
import SwiftUI

/// How far pressing Save has got.
///
/// One Save, but not one write. POPS-3646 creates each purchase from its own
/// draft, so a batch of three is three calls and can stop after two. The
/// screen cannot pretend a batch saves or fails as a unit, so it does the next
/// most honest thing: whatever was written is final and leaves the batch, and
/// the one refused is put on screen with the reason as its banner.
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

    /// The banner the refused purchase carries, and only that one.
    ///
    /// The danger tone is reserved for this. Everything else on the review
    /// screen is a prompt to look; this is the one thing that went wrong.
    internal func notice(for id: String) -> ReceiptDraftView.Status? {
        guard case .failed(let failed, let reason, _) = self, failed == id else { return nil }
        return ReceiptDraftView.Status(tone: .danger, heading: "Not saved", message: reason)
    }

    internal static func alreadySaved(_ count: Int) -> String {
        count == 1
            ? "1 is already saved and stays saved." : "\(count) are already saved and stay saved."
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
}

/// Save, in each of the states pressing it can leave it in.
///
/// While writing it is disabled and says how far it has got. That is half of
/// what stops a double-tap creating two purchases: there is no second tap to
/// make. The other half is the checksum carried through the reading
/// (POPS-3646), for the tap that lands before the button knows.
internal struct ReviewSaveButton: View {
    internal let saving: ReviewSaving
    internal let count: Int
    internal let blocked: Bool
    internal let action: () -> Void

    internal var body: some View {
        Button(action: action) {
            label
                .font(.popsHeadline)
                .padding(.horizontal, PopsSpacing.sm)
                .padding(.vertical, PopsSpacing.xs)
        }
        .playgroundProminentGlassButton()
        .disabled(blocked || saving.isInFlight)
    }

    @ViewBuilder private var label: some View {
        switch saving {
        case .saving(let done):
            HStack(spacing: PopsSpacing.sm) {
                ProgressView()
                Text(count == 1 ? "Saving" : "Saving \(min(done + 1, count)) of \(count)")
            }
        case .failed(_, _, true):
            Label("Try again", systemImage: "arrow.clockwise")
        case .idle, .failed:
            Label(count == 1 ? "Save" : "Save all \(count)", systemImage: "checkmark")
        }
    }
}

/// What an earlier attempt already wrote, where the gate would otherwise sit.
internal struct ReviewSavedTally: View {
    internal let saved: Int

    internal var body: some View {
        Label(saved == 1 ? "1 saved" : "\(saved) saved", systemImage: "checkmark.circle.fill")
            .font(.popsCaption)
            .foregroundStyle(Color.popsSuccess)
            .padding(.horizontal, PopsSpacing.md)
            .padding(.vertical, PopsSpacing.sm)
            .playgroundGlass(in: Capsule())
    }
}
