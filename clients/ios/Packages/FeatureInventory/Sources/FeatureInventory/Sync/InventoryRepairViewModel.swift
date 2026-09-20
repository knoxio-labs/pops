import AppCore
import Observation

/// One repair's state and the two commits it offers, over `InventoryStore`.
///
/// A repair is read from the same sync ledger the Sync page shows, filtered
/// to this one id, rather than fetched separately: a repair another device
/// settles first then simply disappears from the stream, which is the state
/// this model calls `resolvedElsewhere` rather than an error.
@MainActor @Observable
internal final class InventoryRepairViewModel {
    internal enum Phase: Equatable {
        case loading
        case open(InventorySyncRepairRow)
        /// Settled by another device, or by this one before the screen
        /// finished loading. There is nothing left to commit.
        case resolvedElsewhere
    }

    internal private(set) var phase: Phase = .loading
    internal var outcome: String?
    internal var failure: InventoryWriteFailure?

    private let repairId: InventoryRepair.ID
    private let store: any InventoryStore

    internal init(repairId: InventoryRepair.ID, store: any InventoryStore) {
        self.repairId = repairId
        self.store = store
    }

    internal var row: InventorySyncRepairRow? {
        guard case .open(let row) = phase else { return nil }
        return row
    }

    internal func observe() async {
        for await page in store.observe(InventorySyncPage.query()) {
            guard outcome == nil else { continue }
            if let row = page.repairRows.first(where: { $0.repair.id == repairId }) {
                phase = .open(row)
            } else {
                phase = .resolvedElsewhere
            }
        }
    }

    internal func commit(keepingMine: Bool, code: String?) async {
        guard let row else { return }
        let choice: InventoryRepairChoice =
            keepingMine ? .keepMine(code: code) : .discardMine
        do {
            try await store.resolve(row.repair.id, with: choice)
            outcome =
                keepingMine ? outcomeKeeping(row.repair, code: code) : row.repair.kind.letGoOutcome
        } catch {
            guard let reported = InventoryWriteFailure.reporting(error) else { return }
            failure = reported
        }
    }

    private func outcomeKeeping(_ repair: InventoryRepair, code: String?) -> String {
        guard repair.kind == .codeCollision, let code, !code.isEmpty else {
            return repair.kind.keepOutcome
        }
        return "Relabelled \(code)"
    }
}
