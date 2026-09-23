import AppCore
import Observation

internal enum PurchaseEditCancelAction: Hashable, Sendable {
    case dismiss
    case confirmDiscard
    case stay
}

internal enum PurchaseEditFailure: Hashable, Sendable {
    case unavailable
    case unauthorized
    case contractMismatch
    case notFound
    case invalidDraft
    case purchaseLocked
    case purchaseStale

    internal init(_ error: Error) {
        switch error as? RepositoryError {
        case .conflict("purchase_locked"): self = .purchaseLocked
        case .conflict("purchase_stale"): self = .purchaseStale
        case .unauthorized: self = .unauthorized
        case .contractMismatch, .conflict, .dependencyNotBound: self = .contractMismatch
        case .transport, .unavailable, nil: self = .unavailable
        }
    }

    internal var message: String {
        switch self {
        case .purchaseLocked: "Merchant, date and total are locked by the bank match"
        case .purchaseStale: "Changed elsewhere. Close and open it again"
        case .unavailable: "No connection. Your changes are still here."
        case .unauthorized: "Sign in again. Your changes are still here."
        case .contractMismatch: "This purchase can't be saved by this version."
        case .notFound: "This purchase no longer exists."
        case .invalidDraft: "Check the edited values and try again."
        }
    }
}

@MainActor @Observable
internal final class PurchaseEditModel {
    internal private(set) var draft: ReceiptDraft
    internal private(set) var changed = false
    internal private(set) var confirmingDiscard = false
    internal private(set) var saving = false
    internal private(set) var failure: PurchaseEditFailure?
    internal let opened: ReceiptDraft

    private let detail: PurchaseDetail
    private let repository: any PurchasesRepository
    private var saved = false

    internal init(detail: PurchaseDetail, dependencies: AppDependencies) {
        self.detail = detail
        opened = PurchaseEditDraft.draft(for: detail)
        draft = opened
        repository = dependencies.purchases
    }

    internal func updateDraft(_ draft: ReceiptDraft) {
        guard !saving, !saved else { return }
        self.draft = draft
        changed = draft != opened
    }

    internal func requestCancel() -> PurchaseEditCancelAction {
        guard !saving else { return .stay }
        guard changed else { return .dismiss }
        confirmingDiscard = true
        return .confirmDiscard
    }

    internal func keepEditing() {
        confirmingDiscard = false
    }

    internal func dismissFailure() {
        failure = nil
    }

    internal func save() async -> PurchaseDetail? {
        guard !saving, !saved else { return nil }

        let update: PurchaseUpdate
        do {
            guard
                let mapped = try PurchaseEditMapping.update(
                    from: draft, opened: opened, detail: detail)
            else {
                saved = true
                changed = false
                return detail
            }
            update = mapped
        } catch {
            failure = .invalidDraft
            return nil
        }

        failure = nil
        saving = true
        defer { saving = false }
        do {
            guard let updated = try await repository.updatePurchase(id: detail.id, update) else {
                failure = .notFound
                return nil
            }
            guard !Task.isCancelled else { return nil }
            saved = true
            changed = false
            return updated
        } catch {
            failure = PurchaseEditFailure(error)
            return nil
        }
    }
}
