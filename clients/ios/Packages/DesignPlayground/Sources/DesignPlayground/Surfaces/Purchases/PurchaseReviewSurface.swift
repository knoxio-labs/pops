import AppCore
import DesignSystem
import FeatureReceiptCapture
import SwiftUI

/// Where one purchase in the batch came from.
///
/// Carried rather than inferred from the draft. A receipt for a single unnamed
/// item reads back almost blank, and it is not a receipt nothing could be read
/// off. A purchase typed by hand never reaches this screen: see
/// ``PurchaseHandEntryView``.
internal enum ReviewOrigin: Hashable, Sendable {
    /// Read off paper, however well.
    case read
    /// Paper nothing could be read off. Its form arrives empty and says why.
    case unreadable
}

/// One purchase waiting to be checked.
internal struct ReviewEntry: Identifiable {
    internal let id: String
    internal let draft: ReceiptDraft
    internal let origin: ReviewOrigin
    internal let status: ReceiptDraftView.Status?
    internal let parts: [ReceiptPart]
}

/// Checking what was read, one purchase at a time.
///
/// Paged rather than listed. Every one of these needs looking at — that is
/// what the step is for — and a list invites the reader to open the two that
/// look wrong and save the rest unread, which is the failure this whole flow
/// exists to prevent. One at a time makes checking the default and skipping
/// the deliberate act.
///
/// ## The unreadable ones come first
///
/// A receipt nothing could be read off arrives with an empty form and needs
/// every field typed. It goes to the front, flagged. Putting it last would
/// leave the hardest work for the point at which somebody has least patience
/// for it, and leaving it in picked order would hide it in a long batch.
///
/// ## Saving is the batch; discarding is not
///
/// There is one Save, and it creates every purchase still in the batch. That
/// is what makes the step a step: `POST /receipts` writing nothing until then
/// (POPS-3646) is what allows one moment to mean "all of this is right".
///
/// Discard is per purchase, because a blurred photograph is one receipt's
/// problem and should not cost the three that read cleanly. Cancel throws the
/// batch away, and says how much.
///
/// There is no third way out. Nothing here is kept as a draft anywhere —
/// there is nowhere to keep it and no surface to find it again — so leaving
/// with work unsaved would be a promise the app cannot keep.
///
/// ## Saving can stop partway
///
/// See ``ReviewSaving``. What was written leaves the batch, and the refused
/// purchase is put on screen with its reason. Offering to discard a purchase
/// that now exists would be a lie about what Cancel does.
internal struct PurchaseReviewSurface: View {
    internal let entries: [ReviewEntry]
    internal let complaints: ReceiptDraftView.ComplaintStyle
    internal let merchants: [ReceiptMerchantChoice]

    @Environment(\.dismiss) private var dismiss
    @State private var index = 0
    @State private var discarded: Set<String> = []
    @State private var cancelling = false
    @State private var discarding = false
    /// Which have been on screen. Only the flagged ones are gated on it, so
    /// this is not a record of what was read — nothing can be — it is a record
    /// of what was put in front of somebody.
    @State private var visited: Set<String> = []
    @State private var saving: ReviewSaving
    /// Purchases an earlier attempt created, and which have left the batch.
    @State private var written: Int

    /// `complaints` defaults to what `review-complaint-density` decided; the
    /// experiment's own variants pass the others.
    internal init(
        entries: [ReviewEntry],
        complaints: ReceiptDraftView.ComplaintStyle = .hintsOnly,
        merchants: [ReceiptMerchantChoice] = PurchaseMerchantFixtures.all,
        saving: ReviewSaving = .idle,
        written: Int = 0
    ) {
        self.entries = entries
        self.complaints = complaints
        self.merchants = merchants
        _saving = State(initialValue: saving)
        _written = State(initialValue: written)
    }

    private var remaining: [ReviewEntry] {
        ReviewBatch.remaining(entries, discarded: discarded, written: written)
    }

    private var current: ReviewEntry? {
        remaining.indices.contains(index) ? remaining[index] : remaining.last
    }

    private var position: Int {
        min(index, max(remaining.count - 1, 0)) + 1
    }

    internal var body: some View {
        Group {
            if let current {
                form(for: current)
            } else {
                nothingLeft
            }
        }
        .background(Color.popsBackground)
        .onAppear { markSeen() }
        .onChange(of: index) { markSeen() }
        .navigationTitle(title)
        .playgroundTitleDisplay(large: false)
        .playgroundLeadingBarItem { cancel }
        // An inset, not an overlay. An overlay reserves nothing, so the last
        // row of the content sat underneath the controls with no way to
        // scroll past them; an inset takes the height out of the scroll's safe
        // area and the content clears it.
        .safeAreaInset(edge: .bottom) { controls }
    }

    private var title: String {
        remaining.isEmpty ? "Nothing left" : "\(position) of \(remaining.count)"
    }

    /// `ReceiptDraftView` itself, not a second form. POPS-2455 was cancelled
    /// so there would be one form rather than a receipt-filled one and a
    /// manual one that drift apart, and a review step that built its own would
    /// be the third.
    private func form(for entry: ReviewEntry) -> some View {
        ReceiptDraftView(
            draft: entry.draft,
            // No heading. The bar already says `2 of 3`, the status banner
            // says whether anything is wrong with this one, and a third line
            // saying "Check this purchase" over a screen whose whole job is
            // checking the purchase is words where the receipt should be. An
            // unreadable one still needs its sentence, because an empty form
            // with no explanation reads as a form that failed to load.
            subtitle: entry.origin == .unreadable
                ? "Nothing could be read off this one. The paper is stored, so fill in what it says."
                : nil,
            // A refused save outranks the gate's complaint: that one is a
            // reason to look, and this one is the thing that went wrong.
            status: saving.notice(for: entry.id) ?? entry.status,
            complaints: complaints,
            merchants: merchants,
            parts: entry.parts
        )
        .id(entry.id)
    }

    private var nothingLeft: some View {
        EmptyStateView(
            message: written == 0
                ? "Every purchase in this batch was discarded."
                : "\(written) saved. The rest were discarded.")
    }

    // MARK: Getting about

    private var controls: some View {
        VStack(spacing: PopsSpacing.sm) {
            gate
            row
        }
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.bottom, PopsSpacing.lg)
    }

    private var row: some View {
        HStack(spacing: PopsSpacing.md) {
            step("chevron.left", back: true)
            step("chevron.right", back: false)
            Spacer(minLength: PopsSpacing.sm)
            discard
            save
        }
    }

    private func step(_ symbol: String, back: Bool) -> some View {
        Button {
            index = back ? max(index - 1, 0) : min(index + 1, remaining.count - 1)
        } label: {
            Image(systemName: symbol)
                .font(.popsHeadline)
                .padding(PopsSpacing.sm)
        }
        .playgroundGlassButton()
        .disabled(saving.isInFlight || (back ? position == 1 : position == remaining.count))
        .accessibilityLabel(back ? "Previous purchase" : "Next purchase")
    }

    private var discard: some View {
        Button {
            discarding = true
        } label: {
            Image(systemName: "trash")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsDestructive)
                .padding(PopsSpacing.sm)
        }
        .playgroundGlassButton()
        .disabled(remaining.isEmpty || saving.isInFlight)
        .accessibilityLabel("Discard this purchase")
        .confirmationDialog(
            "Discard this purchase?", isPresented: $discarding, titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) { dropCurrent() }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("The receipt stays stored. Nothing is written either way until you save.")
        }
    }

    /// Always available, not only on the last page. Somebody who has checked
    /// what they came to check should not have to page through the rest to
    /// finish — the count on the button is what says how many they are
    /// committing to.
    private var save: some View {
        ReviewSaveButton(
            saving: saving,
            count: remaining.count,
            blocked: remaining.isEmpty || !unseenFlagged.isEmpty || saving.blocksSave
        ) {
            saving = .saving(done: 0)
        }
    }

    /// Flagged readings that have not been on screen yet.
    ///
    /// The gate is only on these. A reading the model is confident about is
    /// approved by saving, because asking somebody to page through eleven
    /// clean receipts to unlock a button trains them to page without looking —
    /// which buys a worse signal than not asking at all. The ones the gate
    /// itself could not reconcile are where a human's eye is the only thing
    /// that settles it, so those get put in front of one.
    ///
    /// "Seen" is not "read", and this does not pretend otherwise. It is the
    /// strongest claim an interface can actually make.
    private var unseenFlagged: [ReviewEntry] {
        remaining.filter { $0.status != nil && !visited.contains($0.id) }
    }

    /// Says what is holding Save, and goes to it. A disabled button with no
    /// explanation is the thing this exists to avoid. Once a save has written
    /// some, the same place says how many.
    @ViewBuilder private var gate: some View {
        if saving.isInFlight {
            EmptyView()
        } else if let next = unseenFlagged.first, !remaining.isEmpty {
            Button {
                if let target = remaining.firstIndex(where: { $0.id == next.id }) {
                    index = target
                }
            } label: {
                Label(
                    unseenFlagged.count == 1
                        ? "1 still needs checking" : "\(unseenFlagged.count) still need checking",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.popsCaption)
                .padding(.horizontal, PopsSpacing.md)
                .padding(.vertical, PopsSpacing.sm)
            }
            .playgroundGlassButton()
            .tint(Color.popsWarning)
        } else if written > 0 {
            ReviewSavedTally(saved: written)
        }
    }

    private func markSeen() {
        guard let current else { return }
        visited.insert(current.id)
    }

    private var cancel: some View {
        Button {
            cancelling = true
        } label: {
            Image(systemName: "xmark")
        }
        .disabled(saving.isInFlight)
        .accessibilityLabel("Cancel")
        .confirmationDialog(
            cancelTitle, isPresented: $cancelling, titleVisibility: .visible
        ) {
            Button("Discard them all", role: .destructive) { dismiss() }
            Button("Keep checking", role: .cancel) {}
        } message: {
            Text(
                written == 0
                    ? "Nothing has been saved yet, so all of it goes."
                    : ReviewSaving.alreadySaved(written))
        }
    }

    private var cancelTitle: String {
        remaining.count == 1
            ? "Discard this purchase?" : "Discard all \(remaining.count) purchases?"
    }

    /// Discarding the purchase a save was refused on clears the refusal. It
    /// was about that purchase, and leaving its banner or its hold on Save
    /// behind would be a complaint about something no longer in the batch.
    private func dropCurrent() {
        guard let current else { return }
        if saving.failedID == current.id { saving = .idle }
        discarded.insert(current.id)
        index = min(index, max(remaining.count - 1, 0))
    }
}
