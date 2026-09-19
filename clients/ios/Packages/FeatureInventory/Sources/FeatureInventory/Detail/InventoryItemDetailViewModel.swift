import AppCore
import Foundation
import Observation

/// Item detail's state and the writes it issues, over `InventoryStore`.
///
/// The page is one observed query, so nothing here patches it after a write:
/// a command lands, the store emits, and the page follows. What this holds of
/// its own is what the store cannot know: which receipt an Undo capsule
/// reverses, and the last write that failed.
@MainActor @Observable
internal final class InventoryItemDetailViewModel {
    internal enum Phase: Equatable {
        /// The query has not emitted yet; the skeleton shows.
        case loading
        case loaded(InventoryItemDetail)
        /// The item is not in the replica, or has been deleted.
        case missing
        /// The store ended the stream without ever answering.
        case unavailable
    }

    internal let itemId: InventoryItem.ID
    internal private(set) var phase: Phase = .loading
    internal var undoOffer: InventoryUndoOffer?
    internal var failure: RepositoryError?
    /// Move's and Store here's writes: the one runner every placement picker
    /// in this package shares.
    internal let runner: InventoryCommandRunner

    private let store: any InventoryStore
    private let now: @Sendable () -> Date
    private var receipts: [InventoryUndoOffer.ID: InventoryReceipt] = [:]

    internal init(
        itemId: InventoryItem.ID, store: any InventoryStore,
        now: @escaping @Sendable () -> Date = { .now }
    ) {
        self.itemId = itemId
        self.store = store
        self.now = now
        runner = InventoryCommandRunner(store: store)
    }

    internal var detail: InventoryItemDetail? {
        guard case .loaded(let detail) = phase else { return nil }
        return detail
    }

    /// Follows the store until the calling task is cancelled.
    internal func observe() async {
        phase = .loading
        for await detail in store.observe(InventoryItemDetail.query(id: itemId, now: now)) {
            phase = detail.map(Phase.loaded) ?? .missing
        }
        if phase == .loading && !Task.isCancelled { phase = .unavailable }
    }

    internal func refresh() async {
        await store.refresh()
    }

    /// Runs one of the lifecycle commands that act at once and offers Undo.
    /// Discard, Mark lost and Retire act only on an active item, Restore
    /// only on one that can be restored; Destroy, Split and Change quantity
    /// ask first and go through their own methods, so they do nothing here.
    internal func perform(_ command: InventoryLifecycleCommand) async {
        guard let lifecycle = detail?.record.lifecycle,
            let change = Self.change(for: command, from: lifecycle)
        else { return }
        await run(
            .setItemLifecycle(id: itemId, lifecycle: change.lifecycle, reason: change.reason),
            offering: change.offer)
    }

    /// Destroys the item after the page has confirmed. Nothing restores it,
    /// so it leaves no Undo, and any Undo still up is withdrawn.
    internal func destroy() async {
        guard let lifecycle = detail?.record.lifecycle, lifecycle != .destroyed else { return }
        guard await send(.setItemLifecycle(id: itemId, lifecycle: .destroyed, reason: nil)) != nil
        else { return }
        undoOffer = nil
        receipts = [:]
    }

    /// Moves `count` of a group into a record of its own. At least one has
    /// to go and at least one has to stay.
    internal func split(off count: Int) async {
        guard let record = detail?.record, record.lifecycle == .active,
            (1..<record.quantity.count).contains(count)
        else { return }
        await run(
            .splitItem(id: itemId, newItemId: UUID().uuidString.lowercased(), quantity: count),
            offering: InventoryUndoOffer(message: "Split off \(count)", symbol: .split))
    }

    internal func changeQuantity(to count: Int) async {
        guard let record = detail?.record, record.lifecycle == .active,
            (1...InventoryChangeQuantitySheet.ceiling).contains(count),
            count != record.quantity.count
        else { return }
        await run(
            .setItemQuantity(id: itemId, quantity: count),
            offering: InventoryUndoOffer(message: "Quantity \(count)", symbol: .reduceQuantity))
    }

    /// Does what an action-row verb names, or hands back the screen it opens
    /// when that screen is not this one.
    internal func act(_ action: InventoryAction) async -> InventoryItemDetailPending? {
        guard let record = detail?.record else { return nil }
        switch action.id {
        case "restore":
            await perform(.restore)
        case "pick-up":
            await run(
                .moveItem(id: itemId, to: .hand, verb: .pickUp),
                offering: InventoryUndoOffer(message: "Picked up", symbol: .inHand))
        case "put-back":
            guard case .place(let name, let placement) = record.previous else { return nil }
            await run(
                .moveItem(id: itemId, to: placement, verb: .putBack),
                offering: InventoryUndoOffer(message: "Put back in \(name)", symbol: .restore))
        case "close":
            _ = await send(.setItemAccess(id: itemId, access: .closed))
        case "reopen":
            _ = await send(.setItemAccess(id: itemId, access: .open))
        default:
            return InventoryItemDetailPending(actionId: action.id)
        }
        return nil
    }

    /// Reverses what `offer` announced: cancels it if it has not left the
    /// phone, reverts it if it has. An offer is spent once.
    internal func undo(_ offer: InventoryUndoOffer) async {
        guard let receipt = receipts.removeValue(forKey: offer.id) else { return }
        do {
            try await store.undo(receipt)
        } catch {
            record(error)
        }
    }

    /// Reverts a history event with a compensating one rather than editing or
    /// deleting it, so the event log stays append-only.
    internal func revert(_ entry: InventoryActivityEntry) async {
        guard entry.isUndoable else { return }
        _ = await send(.revertEvent(seq: entry.seq, entityKind: .item, entityId: itemId))
    }

    /// Takes the conflict notice's one choice.
    internal func resolveConflict() async {
        guard let conflict = detail?.conflict, conflict.resolution != nil else { return }
        do {
            try await store.resolve(conflict.repairId, with: conflict.choice)
        } catch {
            record(error)
        }
    }

    /// A photograph's bytes, or nil when they cannot be had, which the page
    /// draws as a broken photo.
    internal func photo(_ sha256: String, variant: InventoryPhotoVariant) async -> Data? {
        try? await store.photo(sha256, variant: variant)
    }

    private func run(_ command: InventoryCommand, offering offer: InventoryUndoOffer) async {
        guard let receipt = await send(command) else { return }
        receipts[offer.id] = receipt
        undoOffer = offer
    }

    private func send(_ command: InventoryCommand) async -> InventoryReceipt? {
        do {
            return try await store.perform(command)
        } catch {
            record(error)
            return nil
        }
    }

    private func record(_ error: Error) {
        guard !(Task.isCancelled || error is CancellationError) else { return }
        failure = error as? RepositoryError ?? .transport(String(describing: error))
    }
}

extension InventoryItemDetailViewModel {
    /// What one immediate lifecycle command writes, and the Undo it offers.
    internal struct LifecycleChange: Equatable {
        internal let lifecycle: InventoryLifecycle
        internal let reason: InventoryDiscardReason?
        internal let offer: InventoryUndoOffer
    }

    /// The change `command` makes from `current`, or nil when it does not
    /// apply there: removals start only from active, and Restore only from a
    /// restorable state, which destroyed is not.
    nonisolated internal static func change(
        for command: InventoryLifecycleCommand, from current: InventoryLifecycle
    ) -> LifecycleChange? {
        switch command {
        case .discard(let reason) where current == .active:
            LifecycleChange(
                lifecycle: .discarded, reason: reason,
                offer: InventoryUndoOffer(message: "Discarded", symbol: .discard))
        case .markLost where current == .active:
            LifecycleChange(
                lifecycle: .lost, reason: nil,
                offer: InventoryUndoOffer(message: "Marked lost", symbol: .lost))
        case .retire where current == .active:
            LifecycleChange(
                lifecycle: .retired, reason: nil,
                offer: InventoryUndoOffer(message: "Retired", symbol: .retired))
        case .restore where current.isRestorable:
            LifecycleChange(
                lifecycle: .active, reason: nil,
                offer: InventoryUndoOffer(message: "Restored", symbol: .restore))
        default:
            nil
        }
    }
}
