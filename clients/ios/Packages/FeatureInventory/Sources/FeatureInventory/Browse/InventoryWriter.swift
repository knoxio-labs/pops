import AppCore
import Observation

/// Issues a screen's writes and keeps what the store cannot: which receipts
/// the current Undo capsule reverses, and the last write that failed.
///
/// Every list acts through one of these, so an action on several selected
/// rows is one offer with one Undo, and a refusal reads the same wherever it
/// happened.
@MainActor @Observable
internal final class InventoryWriter {
    internal var undoOffer: InventoryUndoOffer?
    internal var failure: InventoryWriteFailure?

    private let store: any InventoryStore
    private var receipts: [InventoryUndoOffer.ID: [InventoryReceipt]] = [:]

    internal init(store: any InventoryStore) {
        self.store = store
    }

    /// Sends one command with no Undo of its own.
    @discardableResult
    internal func perform(_ command: InventoryCommand) async -> InventoryReceipt? {
        do {
            return try await store.perform(command)
        } catch {
            report(error)
            return nil
        }
    }

    /// Sends `commands` in order and, once at least one has landed, offers
    /// `offer` to reverse every one that did. The first refusal stops the
    /// rest and is reported; what landed before it stays undoable.
    internal func perform(_ commands: [InventoryCommand], offering offer: InventoryUndoOffer) async
    {
        var landed: [InventoryReceipt] = []
        for command in commands {
            guard let receipt = await perform(command) else { break }
            landed.append(receipt)
        }
        guard !landed.isEmpty else { return }
        receipts[offer.id] = landed
        undoOffer = offer
    }

    /// Reverses what `offer` announced, newest change first. An offer is
    /// spent once: a second call reverses nothing more.
    internal func undo(_ offer: InventoryUndoOffer) async {
        guard let landed = receipts.removeValue(forKey: offer.id) else { return }
        for receipt in landed.reversed() {
            do {
                try await store.undo(receipt)
            } catch {
                report(error)
                return
            }
        }
    }

    /// Records a refusal for the alert. Cancellation is not a refusal: a
    /// screen that went away mid-write has nobody to tell.
    internal func report(_ error: Error) {
        guard let reported = InventoryWriteFailure.reporting(error) else { return }
        failure = reported
    }
}
