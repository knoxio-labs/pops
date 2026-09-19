import AppCore
import Foundation
import Observation

/// The dashboard's state and the writes it issues, over `InventoryStore`.
///
/// Every section comes from one observed query, so nothing here is updated by
/// hand after a write: a command lands in the store, the store emits, and the
/// rows move. What this holds of its own is only what the store cannot know:
/// which receipts an Undo capsule would reverse, and the last write that
/// failed, both kept by its `InventoryWriter`.
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

    /// The dashboard's writes, its Undo capsule and its last refusal.
    internal let writer: InventoryWriter
    /// Move's writes: the one runner every placement picker in this package shares.
    internal let runner: InventoryCommandRunner
    private let store: any InventoryStore

    internal init(store: any InventoryStore) {
        self.store = store
        writer = InventoryWriter(store: store)
        runner = InventoryCommandRunner(store: store)
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
        await writer.perform(.setItemAccess(id: container.id, access: .closed))
    }

    /// Returns an in-hand item to where it came from and offers Undo. Does
    /// nothing for a row with nowhere to go back to; the row offers Move
    /// instead.
    internal func putBack(_ item: InventoryDashboard.InHandItem) async {
        await putBack([item.id])
    }

    /// Returns every one of `ids` that has somewhere to go, with one Undo for
    /// all of them: the selection bar's Put back.
    internal func putBack(_ ids: Set<InventoryItem.ID>) async {
        await writer.putBack(ids, from: dashboard?.inHand ?? [])
    }

    /// Reverts a Recent work event with a compensating one (D4).
    internal func undo(_ activity: InventoryDashboard.Activity) async {
        guard activity.isUndoable else { return }
        await writer.perform(
            .revertEvent(
                seq: activity.id, entityKind: activity.entityKind, entityId: activity.entityId))
    }

    /// The row's thumbnail, or nil when it cannot be had; the row then shows
    /// the kind's glyph, which is what it shows for an item with no photo.
    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }
}
