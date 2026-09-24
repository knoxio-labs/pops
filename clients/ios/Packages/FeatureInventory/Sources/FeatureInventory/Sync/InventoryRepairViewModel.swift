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
    /// What a refused Retry of a catalogue repair says: the value still in
    /// the way, in the design's words.
    internal var refusal: String?
    /// Set when Edit item opened the form: the repair settling after that is
    /// the edited change being sent, not someone else's doing.
    internal private(set) var isEditing = false

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
            } else if isEditing, case .open(let row) = phase {
                outcome = row.repair.kind.keepOutcome
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
            if keepingMine, let refused = Self.catalogueRefusal(error, row: row) {
                refusal = refused
                return
            }
            guard let reported = InventoryWriteFailure.reporting(error) else { return }
            failure = reported
        }
    }

    /// Edit item: the form opens against the current fields; saving it
    /// settles this repair with the edited change.
    internal func beginEditing() {
        isEditing = true
    }

    private static func catalogueRefusal(_ error: any Error, row: InventorySyncRepairRow)
        -> String?
    {
        guard let detail = row.catalogue,
            case InventoryCommandError.rejected(let reason, _) = error,
            reason == .catalogueRepairRequired || reason == .catalogueUpdateRequired
        else { return nil }
        return detail.refusal
            ?? InventoryCopy.message(for: .command(.rejected(reason: reason, message: "")))
    }

    private func outcomeKeeping(_ repair: InventoryRepair, code: String?) -> String {
        guard repair.kind == .codeCollision, let code, !code.isEmpty else {
            return repair.kind.keepOutcome
        }
        return "Relabelled \(code)"
    }
}
