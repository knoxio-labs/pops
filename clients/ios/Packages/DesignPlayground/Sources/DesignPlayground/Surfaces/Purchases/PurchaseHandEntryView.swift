import DesignSystem
import FeatureReceiptCapture
import SwiftUI

/// A purchase typed by hand: one at a time, with Save and add another.
///
/// ## Not the review pager
///
/// A batch exists because paper is read together and has to be checked
/// together. A purchase typed by hand is not read, so it has no reason to wait
/// for others, and every save writes at once. Holding several typed drafts to
/// save as one would put the most expensive work in the flow at the most
/// risk: one Cancel, or one failure halfway, would take all of it.
///
/// ## Save and add another
///
/// Saves this purchase and opens a fresh form that keeps the date and the
/// currency. What has been saved so far is counted above the form, so a run of
/// purchases has a tally without anywhere to page to.
internal struct PurchaseHandEntryView: View {
    private static let drafts = ReceiptDraftPresentation()

    @Environment(\.dismiss) private var dismiss
    @State private var draft: ReceiptDraft
    @State private var saved: Int
    @State private var formID = 0
    @State private var cancelling = false
    private let isSaving: Bool
    private let failure: String?

    internal init(
        draft: ReceiptDraft? = nil, saved: Int = 0, isSaving: Bool = false, failure: String? = nil
    ) {
        _draft = State(initialValue: draft ?? Self.drafts.blankDraft(currency: Fixtures.aud))
        _saved = State(initialValue: saved)
        self.isSaving = isSaving
        self.failure = failure
    }

    internal var body: some View {
        ReceiptDraftView(
            draft: draft,
            // A failed save keeps what was typed and says why. This is the
            // only danger tone on the screen, because it is the only error.
            status: failure.map {
                ReceiptDraftView.Status(tone: .danger, heading: "Not saved", message: $0)
            },
            complaints: .hintsOnly,
            merchants: PurchaseMerchantFixtures.all,
            addAnother: ReceiptDraftView.AddAnother { typed in
                saved += 1
                draft = Self.drafts.blankDraft(after: typed)
                formID += 1
            },
            isSaving: isSaving
        ) { _ in
            dismiss()
        }
        // The form keeps its own copy of the draft, so a fresh blank one only
        // takes when the form is a new view.
        .id(formID)
        .navigationTitle("New purchase")
        .playgroundTitleDisplay(large: false)
        .playgroundLeadingBarItem { cancel }
        .safeAreaInset(edge: .top) {
            if saved > 0 {
                ReviewSavedTally(saved: saved)
                    .padding(.top, PopsSpacing.sm)
            }
        }
    }

    /// Always asks, and says what stays. The build asks only when something
    /// has been typed; the form does not publish its live edits to a host, so
    /// the playground cannot tell.
    private var cancel: some View {
        Button {
            cancelling = true
        } label: {
            Image(systemName: "xmark")
        }
        .disabled(isSaving)
        .accessibilityLabel("Cancel")
        .confirmationDialog(
            "Discard this purchase?", isPresented: $cancelling, titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) { dismiss() }
            Button("Keep typing", role: .cancel) {}
        } message: {
            Text(saved == 0 ? "Nothing has been saved yet." : ReviewSaving.alreadySaved(saved))
        }
    }
}

/// Typing purchases with no receipt, as its own screen.
@MainActor
internal enum PurchaseHandEntrySurface {
    private static let drafts = ReceiptDraftPresentation()

    /// A filled form, for the states about what happens when it is saved. It
    /// is a reading underneath, because the playground has no other way to
    /// fill one; what is on screen is what a typed purchase would show.
    private static var filled: ReceiptDraft {
        drafts.draft(extracted: ReceiptPlaygroundFixtures.tillNamesExtracted, failures: [])
    }

    static let surface = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "hand-entry"),
        title: "New purchase",
        synopsis: "A purchase with no receipt, typed one at a time, with Save and add another.",
        chrome: .navigation,
        states: [
            // No pages, no sentence, and not one red rule: nothing is missing
            // from a form nobody has started.
            DesignState("typed", "Entered by hand") {
                PurchaseHandEntryView()
            },
            // Two saved with Save and add another. The date came with the
            // form; nothing else did, and nothing is named as missing.
            DesignState("typed-another", "Two saved, the next one open") {
                PurchaseHandEntryView(draft: drafts.blankDraft(after: filled), saved: 2)
            },
            DesignState("typed-saving", "Saving") {
                PurchaseHandEntryView(draft: filled, isSaving: true)
            },
            DesignState("typed-save-failed", "Not saved, what was typed kept") {
                PurchaseHandEntryView(
                    draft: filled, failure: "No connection, so nothing was saved.")
            },
        ]
    )
}
