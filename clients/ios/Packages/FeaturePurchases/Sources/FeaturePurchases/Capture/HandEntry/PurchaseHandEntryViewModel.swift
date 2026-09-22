import AppCore
import Foundation
import Observation

/// Coordinates manual purchase writes and successive hand-entry forms.
@MainActor
@Observable
public final class PurchaseHandEntryViewModel {
    /// The blank form presented for the current purchase.
    public private(set) var draft: ReceiptDraft
    /// The number of purchases completed through Save and add another.
    public private(set) var saved = 0
    /// Whether a manual purchase write is in flight.
    public private(set) var isSaving = false
    /// The repository failure from the latest save attempt, when one occurred.
    public private(set) var failure: RepositoryError?
    /// Advances whenever Save and add another starts a fresh form.
    public private(set) var formGeneration = 0
    /// Purchase identities written during this hand-entry session, in save order.
    public private(set) var savedPurchaseIDs: [Purchase.ID] = []

    /// The validation failure from the latest save attempt, when one occurred.
    internal private(set) var validationFailure: ReceiptDraftSaveError?

    private let repository: any ReceiptCaptureRepository
    private let makeIdempotencyKey: @Sendable () -> String
    private let presentation = ReceiptDraftPresentation()
    private var pendingSave: (draft: ReceiptDraft, key: String)?

    /// Creates a hand-entry model backed by the app's receipt-capture repository.
    ///
    /// - Parameters:
    ///   - dependencies: The repository bindings used to create manual purchases.
    ///   - makeIdempotencyKey: Produces a key for each distinct intended manual purchase.
    public convenience init(
        dependencies: AppDependencies,
        makeIdempotencyKey: @escaping @Sendable () -> String = { UUID().uuidString }
    ) {
        self.init(
            repository: dependencies.receiptCapture,
            makeIdempotencyKey: makeIdempotencyKey)
    }

    internal init(
        repository: any ReceiptCaptureRepository,
        makeIdempotencyKey: @escaping @Sendable () -> String = { UUID().uuidString }
    ) {
        self.repository = repository
        self.makeIdempotencyKey = makeIdempotencyKey
        draft = presentation.blankDraft(currency: nil)
    }

    /// Writes one manual purchase without advancing the current form.
    ///
    /// A retry of the same draft reuses its idempotency key. A successful write spends that key,
    /// so intentionally saving the same values again creates a separate purchase.
    @discardableResult
    public func save(_ draft: ReceiptDraft) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        failure = nil
        validationFailure = nil
        defer { isSaving = false }

        let key = saveKey(for: draft)
        do {
            let payload = try draft.toManualPayload(idempotencyKey: key)
            let purchase = try await repository.createManualPurchase(payload)
            savedPurchaseIDs.append(purchase.id)
            pendingSave = nil
            return true
        } catch let error as ReceiptDraftSaveError {
            validationFailure = error
            return false
        } catch {
            failure = RepositoryError.describing(error)
            return false
        }
    }

    /// Writes one manual purchase and starts another form only after success.
    public func addAnother(_ draft: ReceiptDraft) async {
        guard await save(draft) else { return }
        self.draft = presentation.blankDraft(after: draft)
        saved += 1
        formGeneration += 1
    }

    private func saveKey(for draft: ReceiptDraft) -> String {
        if let pendingSave, pendingSave.draft == draft { return pendingSave.key }
        let key = makeIdempotencyKey()
        pendingSave = (draft, key)
        return key
    }
}
