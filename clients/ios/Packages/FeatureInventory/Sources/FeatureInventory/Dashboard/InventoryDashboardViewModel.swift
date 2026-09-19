import AppCore
import Foundation
import Observation

/// The dashboard's state and the writes it issues, over `InventoryStore`.
///
/// Every section comes from one observed query, so nothing here is updated by
/// hand after a write: a command lands in the store, the store emits, and the
/// rows move. What this holds of its own is only what the store cannot know:
/// which receipt an Undo capsule would reverse, and the last write that
/// failed.
@MainActor @Observable
internal final class InventoryDashboardViewModel {
    internal enum Phase: Equatable {
        /// The query has not emitted yet; the skeleton shows.
        case loading
        case loaded(InventoryDashboard)
        /// The store ended the stream without ever answering, which only an
        /// unbound or broken store does. A skeleton left up forever would be
        /// a hang with no way out.
        case unavailable
    }

    /// How many events Recent work shows.
    internal static let recentLimit = 3

    internal private(set) var phase: Phase = .loading
    internal var undoOffer: InventoryUndoOffer?
    internal var failure: RepositoryError?

    private let store: any InventoryStore
    private var receipts: [InventoryUndoOffer.ID: InventoryReceipt] = [:]

    internal init(store: any InventoryStore) {
        self.store = store
    }

    internal var dashboard: InventoryDashboard? {
        guard case .loaded(let dashboard) = phase else { return nil }
        return dashboard
    }

    /// Follows the store until the calling task is cancelled.
    internal func observe() async {
        phase = .loading
        for await dashboard in store.observe(
            InventoryDashboard.query(recentLimit: Self.recentLimit))
        {
            phase = .loaded(dashboard)
        }
        if phase == .loading && !Task.isCancelled { phase = .unavailable }
    }

    internal func refresh() async {
        await store.refresh()
    }

    /// Stops a container accepting items. It leaves the open containers panel
    /// because the query stops matching it, not because this removes it.
    internal func close(_ container: InventoryDashboard.OpenContainer) async {
        _ = await run(.setItemAccess(id: container.id, access: .closed))
    }

    /// Returns an in-hand item to where it came from and offers Undo. Does
    /// nothing for a row with nowhere to go back to; the row offers Move
    /// instead.
    internal func putBack(_ item: InventoryDashboard.InHandItem) async {
        guard case .place(let name, let placement) = item.previous else { return }
        guard let receipt = await run(.moveItem(id: item.id, to: placement, verb: .putBack))
        else { return }
        let offer = InventoryUndoOffer(message: "Put back in \(name)", symbol: .restore)
        receipts[offer.id] = receipt
        undoOffer = offer
    }

    /// Reverses what `offer` announced.
    internal func undo(_ offer: InventoryUndoOffer) async {
        guard let receipt = receipts.removeValue(forKey: offer.id) else { return }
        do {
            try await store.undo(receipt)
        } catch {
            record(error)
        }
    }

    /// Reverts a Recent work event with a compensating one (D4).
    internal func undo(_ activity: InventoryDashboard.Activity) async {
        guard activity.isUndoable else { return }
        _ = await run(.revertEvent(seq: activity.id))
    }

    /// The row's thumbnail, or nil when it cannot be had; the row then shows
    /// the kind's glyph, which is what it shows for an item with no photo.
    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }

    private func run(_ command: InventoryCommand) async -> InventoryReceipt? {
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
