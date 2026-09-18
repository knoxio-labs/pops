import AppCore
import Foundation
import Observation

/// Everything the In hand page draws, from one state of the store.
internal struct InventoryInHandPage: Equatable, Sendable {
    internal let items: [InventoryInHand.Item]
    internal let isOffline: Bool

    internal static var query: InventoryQuery<InventoryInHandPage> {
        InventoryQuery { source in
            let status = source.inventoryReplicaStatus()
            return InventoryInHandPage(
                items: InventoryInHand.Item.all(
                    reading: source, places: InventoryPlaceNames(source: source),
                    rowSync: InventoryRowSync(
                        status: status, ledger: source.inventorySyncLedger())),
                isOffline: InventoryOfflineState(status) != nil)
        }
    }
}

/// The In hand page's state and writes, over `InventoryStore`. Nothing asks
/// first: Put back acts at once and Undo is how a mistake is fixed.
@MainActor @Observable
internal final class InventoryInHandViewModel {
    internal enum Phase: Equatable {
        case loading
        case loaded(InventoryInHandPage)
        case unavailable
    }

    internal private(set) var phase: Phase = .loading
    internal let writer: InventoryWriter
    private let store: any InventoryStore

    internal init(store: any InventoryStore) {
        self.store = store
        writer = InventoryWriter(store: store)
    }

    internal var items: [InventoryInHand.Item] {
        guard case .loaded(let page) = phase else { return [] }
        return page.items
    }

    /// Follows the store until the calling task is cancelled.
    internal func observe() async {
        phase = .loading
        for await page in store.observe(InventoryInHandPage.query) {
            phase = .loaded(page)
        }
        if phase == .loading && !Task.isCancelled { phase = .unavailable }
    }

    /// Put all back is offered once more than one thing is in hand.
    internal var offersPutAllBack: Bool { InventoryInHand.offersPutAllBack(items) }

    /// Put all back does something only when at least one row has somewhere
    /// to go.
    internal var canPutAllBack: Bool { InventoryInHand.canPutAnyBack(items) }

    /// Puts back every one of `ids` that has somewhere to go, with one Undo.
    internal func putBack(_ ids: Set<InventoryItem.ID>) async {
        await writer.putBack(ids, from: items)
    }

    internal func putAllBack() async {
        await putBack(Set(items.map(\.id)))
    }

    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }
}
