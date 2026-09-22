import AppCore
import DesignSystem
import FeaturePurchases
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

/// Checking what was read, one purchase at a time, committed from the
/// navigation bar.
///
/// Paged rather than listed. Every one of these needs looking at, and a list
/// invites opening the two that look wrong and saving the rest unread. One at
/// a time makes checking the default and skipping the deliberate act.
///
/// ## The bars
///
/// Cancel and Save are in the navigation bar, as every sheet in the app
/// commits. Getting about is the bottom toolbar: the arrows, what is holding
/// Save, and Discard. There is no bar of full-width buttons anywhere.
///
/// ## The drafts are the screen's, not the form's
///
/// Each purchase's edits are held here, keyed by entry, and the form edits
/// them through a binding. Paging away and back, or a save that stops partway,
/// leaves every edit where it was.
///
/// ## Saving is the batch; discarding is not
///
/// One Save creates every purchase still in the batch. Discard is per
/// purchase, because a blurred photograph is one receipt's problem. Cancel
/// throws the batch away and says how much. See ``ReviewSaving`` for a save
/// that stops partway.
internal struct PurchaseReviewSurface: View {
    internal let entries: [ReviewEntry]
    internal let merchants: [ReceiptMerchantChoice]

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var index = 0
    @State private var forward = true
    @State private var discarded: Set<String> = []
    @State private var cancelling = false
    @State private var discarding = false
    @State private var visited: Set<String> = []
    @State private var drafts: [String: ReceiptDraft]
    @State private var saving: ReviewSaving
    /// Purchases an earlier attempt created, and which have left the batch.
    @State private var written: Int

    internal init(
        entries: [ReviewEntry],
        merchants: [ReceiptMerchantChoice] = PurchaseMerchantFixtures.all,
        saving: ReviewSaving = .idle,
        written: Int = 0
    ) {
        self.entries = entries
        self.merchants = merchants
        _drafts = State(
            initialValue: Dictionary(uniqueKeysWithValues: entries.map { ($0.id, $0.draft) }))
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

    private var holding: [String] {
        let ids = remaining.map(\.id)
        return ReviewBatch.holding(
            ids,
            flagged: Set(remaining.filter { $0.status != nil }.map(\.id)),
            seen: visited,
            saveable: Set(
                ids.filter { id in
                    drafts[id].map { ReceiptDraftView.canSave($0, isSaving: false) } ?? false
                }))
    }

    internal var body: some View {
        ZStack {
            if let current {
                form(for: current)
                    .transition(page)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .safeAreaInset(edge: .top, spacing: PopsSpacing.zero) { banner }
        .onAppear { markSeen() }
        .onChange(of: current?.id) { markSeen() }
        .onChange(of: remaining.isEmpty) { _, empty in if empty { dismiss() } }
        .navigationTitle(title)
        .navigationSubtitle(subtitle)
        .playgroundTitleDisplay(large: false)
        .navigationBarBackButtonHidden()
        .playgroundLeadingBarItem { cancel }
        .playgroundTrailingBarItem { save }
        .playgroundBottomBar { bottomBar }
        .inventoryMotion(value: saving)
        .inventoryMotion(value: current?.id)
        .tint(.popsPurchases)
    }

    private var title: String {
        remaining.count <= 1 ? "Review" : "\(position) of \(remaining.count)"
    }

    private var subtitle: String {
        if case .saving(let done) = saving {
            return "Saving \(min(done + 1, remaining.count)) of \(remaining.count)"
        }
        return written > 0 ? ReviewSaving.saved(written) : ""
    }

    private var page: AnyTransition {
        reduceMotion ? .opacity : .push(from: forward ? .trailing : .leading)
    }

    /// `ReceiptDraftView` itself, not a second form, editing the draft this
    /// screen holds for the entry.
    private func form(for entry: ReviewEntry) -> some View {
        ReceiptDraftView(
            draft: Binding(
                get: { drafts[entry.id] ?? entry.draft },
                set: { drafts[entry.id] = $0 }),
            // An empty form with no explanation reads as a form that failed
            // to load, so the unreadable one keeps a line. Nothing else does:
            // the bar already says where you are.
            subtitle: entry.origin == .unreadable ? "Nothing could be read off this one." : nil,
            status: entry.status,
            complaints: .hintsOnly,
            merchants: merchants,
            parts: entry.parts
        )
        .id(entry.id)
        .disabled(saving.isInFlight)
    }

    @ViewBuilder private var banner: some View {
        if case .saving(let done) = saving {
            PurchaseSaveProgress(done: done, total: remaining.count)
        } else if let current, let reason = saving.notice(for: current.id) {
            PurchaseSaveNotice(reason: reason)
        }
    }

    // MARK: Committing

    private var save: some View {
        Button(saving.saveTitle(count: remaining.count)) { commit() }
            .playgroundProminentGlassButton()
            .disabled(
                remaining.isEmpty || !holding.isEmpty || saving.blocksSave || saving.isInFlight)
    }

    /// Walks the batch one write at a time and closes the sheet when the last
    /// lands. The playground's stand-in for the calls, so the saving state can
    /// be watched rather than only staged.
    private func commit() {
        let count = remaining.count
        saving = .saving(done: 0)
        Task {
            for done in 1...max(count, 1) {
                try? await Task.sleep(for: InventoryMotion.stagedBeat)
                saving = .saving(done: done)
            }
            dismiss()
        }
    }

    private var cancel: some View {
        Button("Cancel") { cancelling = true }
            .disabled(saving.isInFlight)
            .confirmationDialog(
                cancelTitle, isPresented: $cancelling, titleVisibility: .visible
            ) {
                Button("Discard", role: .destructive) { dismiss() }
                Button("Keep checking", role: .cancel) {}
            } message: {
                Text(written == 0 ? "Nothing is saved yet." : ReviewSaving.alreadySaved(written))
            }
    }

    private var cancelTitle: String {
        remaining.count == 1
            ? "Discard this purchase?" : "Discard all \(remaining.count) purchases?"
    }

    private func markSeen() {
        guard let current else { return }
        visited.insert(current.id)
    }

    /// Discarding the purchase a save was refused on clears the refusal. It
    /// was about that purchase, and leaving its notice or its hold on Save
    /// behind would be a complaint about something no longer in the batch.
    private func dropCurrent() {
        guard let current else { return }
        if saving.failedID == current.id { saving = .idle }
        forward = true
        discarded.insert(current.id)
        index = min(index, max(remaining.count - 1, 0))
    }
}

extension PurchaseReviewSurface {
    @ViewBuilder private var bottomBar: some View {
        if remaining.count > 1 {
            step("chevron.left", back: true)
            step("chevron.right", back: false)
        }
        Spacer()
        gate
        Spacer()
        discard
    }

    private func step(_ symbol: String, back: Bool) -> some View {
        Button {
            forward = !back
            index = back ? max(index - 1, 0) : min(index + 1, remaining.count - 1)
        } label: {
            Image(systemName: symbol)
        }
        .disabled(saving.isInFlight || (back ? position == 1 : position == remaining.count))
        .accessibilityLabel(back ? "Previous purchase" : "Next purchase")
    }

    /// What is holding Save, and a way straight to it. A disabled Save with
    /// nothing saying why is the thing this exists to avoid.
    @ViewBuilder private var gate: some View {
        if let next = holding.first, !saving.isInFlight {
            Button {
                if let target = remaining.firstIndex(where: { $0.id == next }) {
                    forward = target > index
                    index = target
                }
            } label: {
                HStack(spacing: PopsSpacing.xs) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.popsWarning)
                    Text("\(holding.count) to check")
                        .foregroundStyle(Color.popsForeground)
                }
                .padding(.horizontal, PopsSpacing.sm)
            }
        }
    }

    private var discard: some View {
        Button(role: .destructive) {
            discarding = true
        } label: {
            Image(systemName: "trash")
        }
        .disabled(remaining.isEmpty || saving.isInFlight)
        .accessibilityLabel("Discard this purchase")
        .confirmationDialog(
            "Discard this purchase?", isPresented: $discarding, titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) { dropCurrent() }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("The receipt stays stored.")
        }
    }
}
