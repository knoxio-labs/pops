import DesignSystem
import FeatureReceiptCapture
import SwiftUI

/// A purchase typed by hand: a sheet that commits from its navigation bar.
///
/// Cancel leads, Save trails and is enabled by the draft being saveable, and
/// there is no bar of buttons under the form. The shipped form stacked two
/// full-width actions over the keyboard; this is the answer to that.
///
/// ## Not the review pager
///
/// A batch exists because paper is read together and has to be checked
/// together. A typed purchase is not read, so it has no reason to wait for
/// others, and every save writes at once.
///
/// ## Save and add another
///
/// In the overflow menu beside Save rather than as a second button. One
/// prominent commit is what the bar is for, and the overflow is where iOS
/// keeps the other things a screen can do. It saves, then opens a fresh form
/// that keeps the date and the currency; the count saved so far is the
/// title's subtitle, so a run of purchases has a tally without a row of its
/// own.
internal struct PurchaseHandEntryView: View {
    private static let drafts = ReceiptDraftPresentation()

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var draft: ReceiptDraft
    @State private var opened: ReceiptDraft
    @State private var saved: Int
    @State private var formID = 0
    @State private var cancelling = false
    @State private var isSaving: Bool
    @State private var failure: String?

    internal init(
        draft: ReceiptDraft? = nil, saved: Int = 0, isSaving: Bool = false, failure: String? = nil
    ) {
        let start = draft ?? Self.drafts.blankDraft(currency: Fixtures.aud)
        _draft = State(initialValue: start)
        _opened = State(initialValue: start)
        _saved = State(initialValue: saved)
        _isSaving = State(initialValue: isSaving)
        _failure = State(initialValue: failure)
    }

    private var canSave: Bool { ReceiptDraftView.canSave(draft, isSaving: isSaving) }

    internal var body: some View {
        ZStack {
            ReceiptDraftView(
                draft: $draft, complaints: .hintsOnly, merchants: PurchaseMerchantFixtures.all
            )
            .id(formID)
            .disabled(isSaving)
            .transition(reduceMotion ? .opacity : .push(from: .trailing))
        }
        .safeAreaInset(edge: .top, spacing: PopsSpacing.zero) {
            if let failure { PurchaseSaveNotice(reason: failure) }
        }
        .navigationTitle("New purchase")
        .navigationSubtitle(saved > 0 ? ReviewSaving.saved(saved) : "")
        .playgroundTitleDisplay(large: false)
        .playgroundLeadingBarItem { cancel }
        .playgroundTrailingBarItem { save }
        .playgroundTrailingBarItem { more }
        .inventoryMotion(value: formID)
        .inventoryMotion(value: failure)
        .tint(.popsAccent)
    }

    private var save: some View {
        Button(isSaving ? "Saving" : "Save") {
            commit { dismiss() }
        }
        .playgroundProminentGlassButton()
        .disabled(!canSave)
    }

    private var more: some View {
        Menu {
            Button("Save and Add Another", systemImage: "plus.square.on.square") {
                commit {
                    saved += 1
                    draft = Self.drafts.blankDraft(after: draft)
                    opened = draft
                    formID += 1
                }
            }
            .disabled(!canSave)
        } label: {
            Image(systemName: "ellipsis")
        }
        .disabled(isSaving)
        .accessibilityLabel("More")
    }

    /// One write, and what happens once it lands. A stand-in for the call, so
    /// saving can be watched rather than only staged.
    private func commit(then landed: @escaping () -> Void) {
        failure = nil
        isSaving = true
        Task {
            try? await Task.sleep(for: InventoryMotion.stagedBeat)
            isSaving = false
            landed()
        }
    }

    /// Asks only when something has been typed since the form opened, and says
    /// what stays.
    private var cancel: some View {
        Button("Cancel") {
            if draft == opened { dismiss() } else { cancelling = true }
        }
        .disabled(isSaving)
        .confirmationDialog(
            "Discard this purchase?", isPresented: $cancelling, titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) { dismiss() }
            Button("Keep typing", role: .cancel) {}
        } message: {
            Text(saved == 0 ? "Nothing is saved yet." : ReviewSaving.alreadySaved(saved))
        }
    }
}

/// Typing purchases with no receipt, as its own sheet.
@MainActor
internal enum PurchaseHandEntrySurface {
    private static let drafts = ReceiptDraftPresentation()

    /// A filled form, for the states about what happens when it is saved. It
    /// is a reading underneath, because the playground has no other way to
    /// fill one; what is on screen is what a typed purchase would show.
    private static var filled: ReceiptDraft {
        drafts.draft(
            extracted: ReceiptPlaygroundFixtures.tillNamesExtracted, failures: [],
            matchedMerchantID: "ent-kmart")
    }

    static let surface = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "hand-entry"),
        title: "New purchase",
        synopsis: "A purchase with no receipt, in a sheet that saves from its bar.",
        chrome: .sheet,
        sheetDetents: .large,
        states: [
            // Nothing is missing from a form nobody has started, so nothing
            // says so; Save is simply not yet enabled.
            DesignState("typed", "Entered by hand") {
                PurchaseHandEntryView()
            },
            DesignState("typed-filled", "Filled in, ready to save") {
                PurchaseHandEntryView(draft: filled)
            },
            // Two saved with Save and add another. The date came with the
            // form; nothing else did, and nothing is named as missing.
            DesignState("typed-another", "Two saved, the next one open") {
                PurchaseHandEntryView(draft: drafts.blankDraft(after: filled), saved: 2)
            },
            DesignState("typed-saving", "Saving") {
                PurchaseHandEntryView(draft: filled, isSaving: true)
            },
            // What was typed is still there. Save keeps its name: nothing was
            // written, so pressing it again can only create this one.
            DesignState("typed-save-failed", "Not saved, what was typed kept") {
                PurchaseHandEntryView(
                    draft: filled, failure: "No connection. Nothing was saved.")
            },
        ],
        backdrop: { PurchaseCaptureBackdrop() }
    )
}
