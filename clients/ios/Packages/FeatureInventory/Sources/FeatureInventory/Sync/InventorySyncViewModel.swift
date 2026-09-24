import AppCore
import Foundation
import Observation

/// The Sync page's state and the writes it issues, over `InventoryStore`.
///
/// Follows `InventoryDashboardViewModel`'s shape: one observed query drives
/// every section, and this holds only what the store cannot know — Undo's
/// receipt, the last failure, and whether the storage-full alert is up.
@MainActor @Observable
internal final class InventorySyncViewModel {
    internal enum Phase: Equatable {
        case loading
        case loaded(InventorySyncPage)
        case unavailable
    }

    internal private(set) var phase: Phase = .loading
    internal var undoOffer: InventoryUndoOffer?
    internal var failure: RepositoryError?
    internal var storageFull = false

    private let store: any InventoryStore
    private var receipts:
        [InventoryUndoOffer.ID: (repairId: InventoryRepair.ID, entityId: String)] =
            [:]

    internal init(store: any InventoryStore) {
        self.store = store
    }

    internal var page: InventorySyncPage? {
        guard case .loaded(let page) = phase else { return nil }
        return page
    }

    /// Follows the store until the calling task is cancelled.
    internal func observe() async {
        phase = .loading
        for await page in store.observe(InventorySyncPage.query()) {
            phase = .loaded(page)
        }
        if phase == .loading && !Task.isCancelled { phase = .unavailable }
    }

    internal func refresh() async {
        await store.refresh()
    }

    /// The row's thumbnail, or nil when it cannot be had; the row then shows
    /// the kind's glyph.
    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }

    /// Takes the replica from empty to a current snapshot: the first-launch
    /// and "This app is too old"-recovered Download action.
    internal func download() async {
        do {
            try await store.download()
        } catch InventoryStorageError.full {
            storageFull = true
        } catch {
            record(error)
        }
    }

    /// Resolves a repair with its one inline fix (`InventoryRepairKind.fix`),
    /// from the Sync list rather than the repair's own screen: Keep mine,
    /// except for an `unrecognised` repair, whose only fix is Let go.
    internal func resolveInline(_ repair: InventoryRepair) async {
        await resolve(repair, with: Self.inlineChoice(for: repair.kind))
    }

    nonisolated internal static func inlineChoice(for kind: InventoryRepairKind)
        -> InventoryRepairChoice
    {
        if case .unrecognised = kind { return .discardMine }
        return .keepMine()
    }

    internal func resolve(_ repair: InventoryRepair, with choice: InventoryRepairChoice) async {
        do {
            try await store.resolve(repair.id, with: choice)
            let message = await ledgerOutcome(of: repair.id) ?? outcomeMessage(repair, choice)
            let offer = InventoryUndoOffer(message: message, symbol: .resolved)
            receipts[offer.id] = (repairId: repair.id, entityId: repair.entityId)
            undoOffer = offer
        } catch {
            record(error)
        }
    }

    /// Reverses what `offer` announced. There is no undo for a repair
    /// resolution yet (B5): today this only clears the capsule so it does not
    /// claim an effect it cannot have.
    internal func undo(_ offer: InventoryUndoOffer) async {
        receipts.removeValue(forKey: offer.id)
    }

    /// What the store recorded the resolution as, so the capsule says what
    /// the resolved row will; nil from a store that keeps no ledger.
    private func ledgerOutcome(of repairId: InventoryRepair.ID) async -> String? {
        for await ledger in store.observe(.syncLedger) {
            return ledger.resolved.first { $0.id == repairId }?.outcome
        }
        return nil
    }

    private func outcomeMessage(_ repair: InventoryRepair, _ choice: InventoryRepairChoice)
        -> String
    {
        switch choice {
        case .keepMine(let code):
            return code.map { "Relabelled \($0)" } ?? repair.kind.keepOutcome
        case .replaceMine:
            return repair.kind.keepOutcome
        case .discardMine:
            return repair.kind.letGoOutcome
        }
    }

    private func record(_ error: Error) {
        guard !(Task.isCancelled || error is CancellationError) else { return }
        failure = error as? RepositoryError ?? .transport(String(describing: error))
    }
}
