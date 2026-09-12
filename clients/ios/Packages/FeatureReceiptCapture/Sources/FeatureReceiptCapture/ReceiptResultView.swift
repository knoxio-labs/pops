import AppCore
import DesignSystem
import SwiftUI

/// What a receipt extraction resolved to (POPS-2454).
///
/// It renders and it retries; every decision — whether a reading has landed,
/// whether the call ever got far enough to answer with one — is
/// ``ReceiptResultViewModel``'s. Same split as `TransactionDetailView`.
///
/// The screen draws no navigation chrome of its own: whoever embeds it — the
/// capture flow — owns where it sits and what the bar says.
///
/// ## Every usable reading reaches the same form
///
/// `.draft` is not a terminal card the way `created` used to be: it is
/// ``ReceiptDraftView``, pre-filled from ``ReceiptDraftPresentation`` and
/// wired straight to ``ReceiptResultViewModel/save(_:)``. Reconciled or not,
/// the reader sees the same editable fields — the distinction lives in the
/// status header above them, not in whether the form exists at all.
///
/// ## The paper is above every state, including the ones that failed
///
/// ``ReceiptPagesView`` sits over every arm rather than inside the outcomes.
/// While the call is in flight it is what makes the wait look like something
/// happening to a specific receipt rather than a spinner on an empty screen;
/// on `unreadable` it is the evidence — a reader told the photo could not be
/// read wants to see the photo.
public struct ReceiptResultView: View {
    @State private var model: ReceiptResultViewModel

    private let presentation = ReceiptResultPresentation()
    private let draftPresentation = ReceiptDraftPresentation()

    public init(model: ReceiptResultViewModel) {
        _model = State(wrappedValue: model)
    }

    public var body: some View {
        Group {
            if isForm {
                // `ReceiptDraftView` is a `ScrollView` of its own, with its own
                // pages, its own bottom bar and its own accessibility root —
                // wrapping it in a second one here nests two vertical scroll
                // views, and the inner one renders at zero height. That is
                // not hypothetical: it is what the first real render of this
                // branch, a Maestro flow reaching manual entry, actually hit.
                content
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                        ReceiptPagesView(parts: model.parts)
                        content
                    }
                    .padding(PopsSpacing.lg)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.popsBackground)
            }
        }
        .task { await model.extract() }
        .alert(
            ReceiptResultCopy.saveFailedTitle,
            isPresented: saveErrorPresented,
            presenting: model.saveError
        ) { _ in
            Button(ReceiptDraftCopy.dismissSaveError) { model.dismissSaveError() }
        } message: { error in
            Text(ReceiptResultCopy.message(for: error))
        }
        .alert(
            ReceiptResultCopy.saveFailedTitle,
            isPresented: saveValidationErrorPresented,
            presenting: model.saveValidationError
        ) { _ in
            Button(ReceiptDraftCopy.dismissSaveError) { model.dismissSaveValidationError() }
        } message: { error in
            Text(ReceiptDraftCopy.message(for: error))
        }
    }

    /// `internal` rather than `private` so a test can render one state at a
    /// time without going through `body`'s `.task` — the same reason
    /// `ReceiptCapturePrompt` was split out as its own type instead of a
    /// private computed property.
    @ViewBuilder internal var content: some View {
        switch model.state {
        case .extracting:
            LoadingStateView(message: ReceiptResultCopy.submitting)
                .accessibilityIdentifier(ReceiptResultAccessibility.submitting)
        case .extractionFailed(let error):
            ErrorStateView(
                message: ReceiptResultCopy.message(for: error),
                retryTitle: ReceiptResultCopy.retry,
                retryAccessibilityIdentifier: ReceiptResultAccessibility.retryButton
            ) {
                Task { await model.extract() }
            }
        case .unreadable(let receiptCount, let reason):
            ReceiptResultCard(
                content: presentation.content(.unreadable(receiptCount: receiptCount, reason: reason))
            )
            .accessibilityIdentifier(ReceiptResultAccessibility.unreadable)
        case .draft(let reading):
            draftView(for: reading)
        case .manualEntry:
            manualEntryView
        case .saved(let purchase):
            ReceiptResultCard(
                content: presentation.content(.created(purchase: purchase, alreadyStored: false))
            )
            .accessibilityIdentifier(ReceiptResultAccessibility.created)
        }
    }

    /// Whether ``content`` is, itself, a complete scrollable screen —
    /// ``ReceiptDraftView`` — rather than a card ``body`` needs to wrap in its
    /// own `ScrollView` alongside ``ReceiptPagesView``.
    private var isForm: Bool {
        switch model.state {
        case .draft, .manualEntry: true
        case .extracting, .extractionFailed, .unreadable, .saved: false
        }
    }

    private func draftView(for reading: ReceiptDraftReading) -> some View {
        ReceiptDraftView(
            draft: draftPresentation.draft(extracted: reading.extracted, failures: reading.failures),
            title: ReceiptDraftCopy.title,
            subtitle: ReceiptDraftCopy.subtitle,
            status: reading.reconciled ? nil : draftStatus,
            parts: model.parts,
            save: { draft in Task { await model.save(draft) } }
        )
    }

    private var manualEntryView: some View {
        ReceiptDraftView(
            draft: draftPresentation.blankDraft(currency: nil),
            title: ReceiptDraftCopy.manualTitle,
            subtitle: ReceiptDraftCopy.manualSubtitle,
            parts: model.parts,
            save: { draft in Task { await model.save(draft) } }
        )
    }

    private var draftStatus: ReceiptDraftView.Status {
        ReceiptDraftView.Status(
            tone: .warning,
            heading: ReceiptDraftCopy.unreconciledHeading,
            message: ReceiptDraftCopy.unreconciledMessage
        )
    }

    private var saveErrorPresented: Binding<Bool> {
        Binding(
            get: { model.saveError != nil },
            set: { presented in if !presented { model.dismissSaveError() } }
        )
    }

    private var saveValidationErrorPresented: Binding<Bool> {
        Binding(
            get: { model.saveValidationError != nil },
            set: { presented in if !presented { model.dismissSaveValidationError() } }
        )
    }
}
