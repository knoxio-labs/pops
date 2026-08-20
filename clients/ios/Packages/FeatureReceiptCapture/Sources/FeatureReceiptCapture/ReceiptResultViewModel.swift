import AppCore
import Observation

/// The result screen's whole decision surface.
///
/// The view reads ``state`` and renders; it decides nothing — same split as
/// `TransactionDetailViewModel`. No networking type appears here either: this
/// reads `AppCore`'s ``ReceiptCaptureRepository`` and has no idea whether an
/// HTTP call happened, let alone that the thing behind it attaches a device
/// token and speaks to a BFM.
///
/// Unlike the transaction screens, this model does not seed on content the
/// caller already has — there is nothing to seed with. A receipt's outcome
/// does not exist until the parts have actually been sent, so the screen
/// opens on ``ReceiptResultState/submitting`` every time.
@MainActor
@Observable
public final class ReceiptResultViewModel {
    /// What the screen shows.
    public private(set) var state: ReceiptResultState = .submitting

    /// The pages this screen is about, kept after they are sent because the
    /// screen goes on drawing them: the reading underneath is only checkable
    /// against the paper it was read off.
    ///
    /// `internal` rather than private for that — ``ReceiptResultView`` needs
    /// them — and no wider, because nothing outside this module has any
    /// business re-reading one submission's bytes.
    internal let parts: [ReceiptPart]

    private let repository: any ReceiptCaptureRepository

    /// Re-entrancy protection. `.task` fires on appearance and a retry is a
    /// button; both can run before the first has answered.
    private var isSubmitting = false

    /// - Parameters:
    ///   - parts: the receipt to submit — one call's worth, in the order
    ///     ``ReceiptPart`` documents. Captured once; a different receipt is a
    ///     different screen, not a new call to ``submit()``.
    ///   - dependencies: read for ``ReceiptCaptureRepository`` and nothing
    ///     else.
    public init(parts: [ReceiptPart], dependencies: AppDependencies) {
        self.parts = parts
        repository = dependencies.receiptCapture
    }
}

extension ReceiptResultViewModel {
    /// Sends the receipt and records what came back.
    ///
    /// Safe to call on every appearance and from a retry button alike: it
    /// does nothing once an outcome has landed — an outcome is real money (or
    /// a real absence of it), and resubmitting the same bytes because a view
    /// reappeared would risk asking the pillar to read a receipt twice for a
    /// reason that has nothing to do with the receipt. A failure that never
    /// reached an outcome carries no such risk, so it is the one state a
    /// second call is allowed to replace.
    public func submit() async {
        guard !isSubmitting else { return }
        if case .outcome = state { return }

        isSubmitting = true
        state = .submitting
        defer { isSubmitting = false }

        do {
            let outcome = try await repository.capture(parts)
            state = .outcome(outcome)
        } catch let error where error.isCancellation {
            return
        } catch {
            state = .failed(RepositoryError.describing(error))
        }
    }
}
