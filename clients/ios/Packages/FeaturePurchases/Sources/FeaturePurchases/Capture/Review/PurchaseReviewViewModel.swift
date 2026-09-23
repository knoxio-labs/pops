import AppCore
import Foundation
import Observation

@MainActor
@Observable
internal final class PurchaseReviewViewModel {
    internal let entries: [ReviewEntry]
    internal private(set) var drafts: [String: ReceiptDraft]
    internal private(set) var seen: Set<String> = []
    internal private(set) var discarded: Set<String> = []
    internal private(set) var saving: ReviewSaving = .idle
    internal private(set) var savedPurchaseIDs: [Purchase.ID] = []

    private let repository: any ReceiptCaptureRepository
    private let makeIdempotencyKey: @Sendable () -> String
    private var saveKeys: [String: (draft: ReceiptDraft, key: String)] = [:]

    internal convenience init(entries: [ReviewEntry], dependencies: AppDependencies) {
        self.init(entries: entries, repository: dependencies.receiptCapture)
    }

    internal init(
        entries: [ReviewEntry],
        repository: any ReceiptCaptureRepository,
        makeIdempotencyKey: @escaping @Sendable () -> String = { UUID().uuidString }
    ) {
        self.entries = entries
        self.repository = repository
        self.makeIdempotencyKey = makeIdempotencyKey
        drafts = Dictionary(uniqueKeysWithValues: entries.map { ($0.id, $0.draft) })
    }

    internal var written: Int { savedPurchaseIDs.count }

    internal var remaining: [ReviewEntry] {
        ReviewBatch.remaining(entries, discarded: discarded, written: written)
    }

    internal var holding: [String] {
        let current = remaining
        let ids = current.map(\.id)
        let flagged = Set(current.filter { $0.status != nil }.map(\.id))
        let saveable = Set(
            ids.filter { id in
                drafts[id].map { ReceiptDraftView.canSave($0, isSaving: false) } == true
            })
        return ReviewBatch.holding(ids, flagged: flagged, seen: seen, saveable: saveable)
    }

    internal var toCheck: Int { holding.count }

    internal func edit(_ id: String, draft: ReceiptDraft) {
        guard drafts[id] != nil else { return }
        drafts[id] = draft
    }

    internal func markSeen(_ id: String) {
        guard entries.contains(where: { $0.id == id }) else { return }
        seen.insert(id)
    }

    internal func discard(_ id: String) {
        guard !saving.isInFlight, remaining.contains(where: { $0.id == id }) else { return }
        discarded.insert(id)
        saveKeys[id] = nil
        if saving.failedID == id { saving = .idle }
    }

    internal func save() async {
        guard !saving.isInFlight, !saving.blocksSave, holding.isEmpty else { return }
        let toSave = remaining.compactMap { entry in
            drafts[entry.id].map { (entry: entry, draft: $0) }
        }
        guard !toSave.isEmpty else { return }

        saving = .saving(done: 0)
        for item in toSave {
            let key = saveKey(for: item.entry.id, draft: item.draft)
            do {
                let purchase = try await persist(item.entry, draft: item.draft, key: key)
                savedPurchaseIDs.append(purchase.id)
                saveKeys[item.entry.id] = nil
                saving = .saving(done: written)
            } catch let error where error.isCancellation {
                saving = .idle
                return
            } catch let error as ReceiptDraftSaveError {
                saving = .failed(
                    id: item.entry.id,
                    reason: ReceiptDraftCopy.message(for: error),
                    retryable: false)
                return
            } catch let error as RepositoryError {
                record(error, for: item.entry.id)
                return
            } catch {
                record(RepositoryError.describing(error), for: item.entry.id)
                return
            }
        }
        saving = .idle
    }

    private func saveKey(for id: String, draft: ReceiptDraft) -> String {
        if let stored = saveKeys[id], stored.draft == draft { return stored.key }
        let key = makeIdempotencyKey()
        saveKeys[id] = (draft, key)
        return key
    }

    private func persist(
        _ entry: ReviewEntry, draft: ReceiptDraft, key: String
    ) async throws -> ReceiptPurchase {
        switch entry.origin {
        case .read:
            guard let reading = entry.reading else {
                preconditionFailure("A read review entry requires its receipt reading")
            }
            return try await repository.saveDraft(
                draft.toSavePayload(reading: reading, idempotencyKey: key))
        case .unreadable:
            return try await repository.createManualPurchase(
                draft.toManualPayload(idempotencyKey: key))
        }
    }

    private func record(_ error: RepositoryError, for id: String) {
        let retryable: Bool
        if case .conflict = error {
            retryable = false
        } else {
            retryable = true
        }
        saving = .failed(
            id: id,
            reason: PurchaseReviewCopy.saveFailure(error),
            retryable: retryable)
    }
}
