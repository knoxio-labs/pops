import DesignSystem
import SwiftUI

/// What a receipt upload resolved to.
///
/// It renders and it retries; every decision — whether an outcome has
/// landed, whether the call ever got far enough to answer with one — is
/// ``ReceiptResultViewModel``'s. Same split as `TransactionDetailView`.
///
/// The screen draws no navigation chrome of its own: whoever embeds it — the
/// capture flow — owns where it sits and what the bar says.
///
/// ## The paper is above every state, including the ones that failed
///
/// ``ReceiptPagesView`` sits over all four states rather than inside the
/// outcomes. While the call is in flight it is what makes the wait look like
/// something happening to a specific receipt rather than a spinner on an
/// empty screen; on `unreadable` it is the evidence — a reader told the photo
/// could not be read wants to see the photo. Only a state with no submission
/// behind it would draw without it, and there is no such state: this screen
/// is constructed from parts.
public struct ReceiptResultView: View {
    @State private var model: ReceiptResultViewModel

    private let presentation = ReceiptResultPresentation()

    public init(model: ReceiptResultViewModel) {
        _model = State(wrappedValue: model)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                ReceiptPagesView(parts: model.parts)
                content
            }
            .padding(PopsSpacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .task { await model.submit() }
    }

    /// `internal` rather than `private` so a test can render one state at a
    /// time without going through `body`'s `.task` — the same reason
    /// `ReceiptCapturePrompt` was split out as its own type instead of a
    /// private computed property.
    ///
    /// The scrolling is `body`'s now rather than each state's: a `ScrollView`
    /// per outcome would have meant the pages above scrolled separately from
    /// the reading below them, which on a long `needsReview` is two things
    /// moving when the reader meant one.
    @ViewBuilder internal var content: some View {
        switch model.state {
        case .submitting:
            LoadingStateView(message: ReceiptResultCopy.submitting)
                .accessibilityIdentifier(ReceiptResultAccessibility.submitting)
        case .failed(let error):
            ErrorStateView(
                message: ReceiptResultCopy.message(for: error),
                retryTitle: ReceiptResultCopy.retry,
                retryAccessibilityIdentifier: ReceiptResultAccessibility.retryButton
            ) {
                Task { await model.submit() }
            }
        case .outcome(let outcome):
            ReceiptResultCard(content: presentation.content(outcome))
        }
    }
}
