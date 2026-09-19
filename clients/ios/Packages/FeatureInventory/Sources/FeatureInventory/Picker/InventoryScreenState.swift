import AppCore
import Observation

/// Where one observed query stands, as a screen draws it.
internal enum InventoryLoadPhase<Value: Equatable>: Equatable {
    /// The query has not answered yet; the skeleton shows.
    case loading
    case loaded(Value)
    /// The store ended the stream without ever answering, which only an
    /// unbound or broken store does. A skeleton left up forever would be a
    /// hang with no way out.
    case unavailable
}

/// One query followed for as long as a screen is up: the containers, the
/// locations and the placement picker each read through one of these, so
/// every section of a screen comes from the same state and nothing is
/// patched by hand after a write.
@MainActor @Observable
internal final class InventoryObservation<Value: Sendable & Equatable> {
    internal private(set) var phase: InventoryLoadPhase<Value> = .loading
    private let store: any InventoryStore
    private let query: InventoryQuery<Value>

    internal init(store: any InventoryStore, query: InventoryQuery<Value>) {
        self.store = store
        self.query = query
    }

    /// Follows the store until the calling task is cancelled.
    internal func observe() async {
        phase = .loading
        for await value in store.observe(query) {
            phase = .loaded(value)
        }
        if phase == .loading && !Task.isCancelled { phase = .unavailable }
    }
}

/// Issues a screen's writes and keeps what an Undo capsule needs: the
/// receipts of the last change it announced, and the last write that failed.
///
/// Several commands can make up one change a person made (moving three rows,
/// or creating a place and then moving into it). They are performed in order
/// and stop at the first that fails; Undo reverses every one that landed,
/// newest first.
@MainActor @Observable
internal final class InventoryCommandRunner {
    internal var undoOffer: InventoryUndoOffer?
    internal var failure: InventoryWriteFailure?
    internal let store: any InventoryStore
    private var receipts: [InventoryUndoOffer.ID: [InventoryReceipt]] = [:]

    internal init(store: any InventoryStore) {
        self.store = store
    }

    /// Performs `commands` in order. Returns every receipt when all landed,
    /// or nil when one failed, in which case `failure` says why and the ones
    /// before it stand.
    @discardableResult
    internal func perform(_ commands: [InventoryCommand]) async -> [InventoryReceipt]? {
        var landed: [InventoryReceipt] = []
        for command in commands {
            do {
                landed.append(try await store.perform(command))
            } catch {
                record(error)
                return nil
            }
        }
        return landed
    }

    /// Performs `commands` and, when all of them land, offers Undo for them
    /// with `message`. Returns whether they landed.
    @discardableResult
    internal func perform(
        _ commands: [InventoryCommand], announcing message: String, symbol: InventorySymbol
    ) async -> Bool {
        guard !commands.isEmpty, let landed = await perform(commands) else { return false }
        offer(landed, message: message, symbol: symbol)
        return true
    }

    /// Offers Undo for changes that have already landed.
    internal func offer(_ landed: [InventoryReceipt], message: String, symbol: InventorySymbol) {
        let offer = InventoryUndoOffer(message: message, symbol: symbol)
        receipts[offer.id] = landed
        undoOffer = offer
    }

    /// Reverses what `offer` announced. A spent offer reverses nothing.
    internal func undo(_ offer: InventoryUndoOffer) async {
        guard let landed = receipts.removeValue(forKey: offer.id) else { return }
        for receipt in landed.reversed() {
            do {
                try await store.undo(receipt)
            } catch {
                record(error)
                return
            }
        }
    }

    /// Settles an open repair with `choice`. Returns whether the store took
    /// it; when it did not, `failure` says why. A resolution offers no Undo.
    @discardableResult
    internal func resolve(_ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice)
        async -> Bool
    {
        do {
            try await store.resolve(repairId, with: choice)
            return true
        } catch {
            record(error)
            return false
        }
    }

    private func record(_ error: Error) {
        guard let reported = InventoryWriteFailure.reporting(error) else { return }
        failure = reported
    }
}
