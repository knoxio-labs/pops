import AppCore
import Foundation
import Observation

/// The result screen's whole decision surface (POPS-2454).
///
/// The view reads ``state`` and renders; it decides nothing — same split as
/// `TransactionDetailViewModel`. No networking type appears here either: this
/// reads `AppCore`'s ``ReceiptCaptureRepository`` and has no idea whether an
/// HTTP call happened, let alone that the thing behind it attaches a device
/// token and speaks to a BFM.
///
/// Extraction and saving are two calls now, and this model owns both: it
/// asks `extract`, holds whatever draft came back, and asks `saveDraft` with
/// whatever the reader edited. The draft itself — the editable form state —
/// lives in ``ReceiptDraftView``'s own `@State`, not here; this model only
/// ever sees the ``ReceiptDraft`` a save closure hands it, once, at the
/// moment Save is pressed.
@MainActor
@Observable
public final class ReceiptResultViewModel {
    /// What the screen shows.
    public private(set) var state: ReceiptResultState = .extracting

    /// Set the moment a `saveDraft` call fails and cleared the moment another
    /// is attempted. Separate from ``state`` because a failed save must not
    /// discard the reader's edits — the form ``ReceiptDraftView`` is showing
    /// stays exactly where it is; only a banner appears over it.
    public private(set) var saveError: RepositoryError?

    /// Set when a field could not be parsed into what the BFM needs — an
    /// amount that is not a number, a date the printed-looking field does not
    /// hold in a shape this can turn into an instant. Kept apart from
    /// ``saveError``: that is a fact about the network, this is a fact about
    /// what the reader typed, and `RepositoryError.transport`'s own payload
    /// is documented as a diagnostic rather than something to show.
    internal private(set) var saveValidationError: ReceiptDraftSaveError?

    /// The pages this screen is about, kept after they are sent because the
    /// screen goes on drawing them: the reading underneath is only checkable
    /// against the paper it was read off.
    ///
    /// `internal` rather than private for that — ``ReceiptResultView`` needs
    /// them — and no wider, because nothing outside this module has any
    /// business re-reading one submission's bytes.
    internal let parts: [ReceiptPart]

    private let repository: any ReceiptCaptureRepository
    private let makeIdempotencyKey: @Sendable () -> String

    /// Re-entrancy protection. `.task` fires on appearance and a retry is a
    /// button; both can run before the first has answered.
    private var isExtracting = false
    private var isSaving = false

    /// - Parameters:
    ///   - parts: the receipt to submit — one call's worth, in the order
    ///     ``ReceiptPart`` documents. Captured once; a different receipt is a
    ///     different screen, not a new call to ``extract()``.
    ///   - dependencies: read for ``ReceiptCaptureRepository`` and nothing
    ///     else.
    public convenience init(parts: [ReceiptPart], dependencies: AppDependencies) {
        self.init(
            parts: parts, repository: dependencies.receiptCapture,
            makeIdempotencyKey: { UUID().uuidString })
    }

    /// A purchase typed by hand — no parts, no `extract` call. ``state``
    /// opens directly on ``ReceiptResultState/manualEntry``, and ``save(_:)``
    /// persists through
    /// ``ReceiptCaptureRepository/createManualPurchase(_:)`` rather than
    /// ``ReceiptCaptureRepository/saveDraft(_:)`` — the branch is on
    /// ``state``, so the same method serves both entry points without either
    /// caller needing to say which.
    public convenience init(enteringManuallyWith dependencies: AppDependencies) {
        self.init(
            parts: [], repository: dependencies.receiptCapture,
            makeIdempotencyKey: { UUID().uuidString }, initialState: .manualEntry)
    }

    internal init(
        parts: [ReceiptPart],
        repository: any ReceiptCaptureRepository,
        makeIdempotencyKey: @escaping @Sendable () -> String = { UUID().uuidString },
        initialState: ReceiptResultState = .extracting
    ) {
        self.parts = parts
        self.repository = repository
        self.makeIdempotencyKey = makeIdempotencyKey
        state = initialState
    }
}

extension ReceiptResultViewModel {
    /// Reads the receipt and records what came back.
    ///
    /// Safe to call on every appearance and from a retry button alike: it
    /// does nothing once a reading has landed. Unlike the old single-call
    /// upload, re-extracting after a draft is already showing would ask the
    /// pillar to read the same receipt a second time for no reason — the
    /// bytes have not changed, and nothing about a reading depends on when it
    /// is asked for.
    public func extract() async {
        guard !isExtracting else { return }
        switch state {
        case .draft, .saved, .unreadable, .manualEntry: return
        case .extracting, .extractionFailed: break
        }

        isExtracting = true
        state = .extracting
        defer { isExtracting = false }

        do {
            switch try await repository.extract(parts) {
            case .draft(let reading):
                state = .draft(reading)
            case .unreadable(let receiptCount, let reason):
                state = .unreadable(receiptCount: receiptCount, reason: reason)
            }
        } catch let error where error.isCancellation {
            return
        } catch {
            state = .extractionFailed(RepositoryError.describing(error))
        }
    }

    /// Persists `draft` as a purchase, from whatever the reader confirmed,
    /// corrected, or typed by hand.
    ///
    /// Which call this makes is decided by ``state``, never by the caller: a
    /// ``ReceiptResultState/draft(_:)`` saves through
    /// ``ReceiptCaptureRepository/saveDraft(_:)``, carrying that reading's
    /// receipt URIs and capture facts forward; a
    /// ``ReceiptResultState/manualEntry`` creates a purchase with neither. A
    /// stray call from any other state does nothing, which cannot happen from
    /// ``ReceiptDraftView`` itself since it only exists on screen while one
    /// of those two is the state.
    public func save(_ draft: ReceiptDraft) async {
        guard !isSaving else { return }
        isSaving = true
        saveError = nil
        saveValidationError = nil
        defer { isSaving = false }

        do {
            let purchase: ReceiptPurchase
            switch state {
            case .draft(let reading):
                let payload = try draft.toSavePayload(
                    reading: reading, idempotencyKey: makeIdempotencyKey())
                purchase = try await repository.saveDraft(payload)
            case .manualEntry:
                let payload = try draft.toManualPayload(idempotencyKey: makeIdempotencyKey())
                purchase = try await repository.createManualPurchase(payload)
            case .extracting, .unreadable, .extractionFailed, .saved:
                return
            }
            state = .saved(purchase)
        } catch let error where error.isCancellation {
            return
        } catch let error as ReceiptDraftSaveError {
            saveValidationError = error
        } catch {
            saveError = RepositoryError.describing(error)
        }
    }

    /// Clears a reported save failure. The draft underneath is untouched —
    /// this only dismisses the banner, so the reader's edits are exactly
    /// where they left them.
    internal func dismissSaveError() {
        saveError = nil
    }

    internal func dismissSaveValidationError() {
        saveValidationError = nil
    }
}
