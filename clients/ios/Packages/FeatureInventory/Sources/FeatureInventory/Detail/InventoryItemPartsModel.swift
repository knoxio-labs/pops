import AppCore
import Foundation
import Observation

/// An item's assembly and parts, read online and edited in place.
///
/// Parts are not in the replica, so the section only appears once the server
/// answers, and stays away when it cannot: an offline phone shows the plain
/// item page rather than an error for a section it never had.
@MainActor @Observable
internal final class InventoryItemPartsModel {
    internal enum Phase: Equatable {
        case loading
        case hidden
        case shown(InventoryItemParts)
    }

    internal let itemId: InventoryItem.ID
    internal private(set) var phase: Phase = .loading
    /// Why the last add or remove did not happen, in words fit to show.
    internal var refusal: String?

    private let service: any InventoryPartsService

    internal init(itemId: InventoryItem.ID, service: any InventoryPartsService) {
        self.itemId = itemId
        self.service = service
    }

    internal var parts: InventoryItemParts? {
        if case .shown(let parts) = phase { parts } else { nil }
    }

    internal func load() async {
        do {
            show(try await service.parts(of: itemId))
        } catch {
            if parts == nil { phase = .hidden }
        }
    }

    /// Adds every picked item in turn, stopping at the first refusal so the
    /// alert names one reason. Returns whether they all landed.
    internal func add(_ partIds: [InventoryItem.ID]) async -> Bool {
        for partId in partIds {
            do {
                show(try await service.addPart(partId, to: itemId))
            } catch {
                refusal = Self.message(for: error)
                await load()
                return false
            }
        }
        return true
    }

    internal func remove(_ partId: InventoryItem.ID) async {
        do {
            show(try await service.removePart(partId, from: itemId))
        } catch {
            refusal = Self.message(for: error)
            await load()
        }
    }

    /// Everything the add-parts picker must not offer: this item, what it is
    /// a part of, and what is already one of its parts.
    internal var excludedFromPicker: Set<InventoryItem.ID> {
        var excluded: Set<InventoryItem.ID> = [itemId]
        if let assembly = parts?.assembly { excluded.insert(assembly.id) }
        for part in parts?.parts ?? [] { excluded.insert(part.id) }
        return excluded
    }

    private func show(_ parts: InventoryItemParts) {
        phase = parts.isEmpty ? .hidden : .shown(parts)
    }

    internal static func message(for error: any Error) -> String {
        switch error {
        case InventoryPartsError.refused(let message): message
        case InventoryPartsError.notFound: "That item is no longer there."
        case let failure as RepositoryError: InventoryCopy.message(for: failure)
        default: InventoryCopy.unavailable
        }
    }
}

/// The add-parts picker: existing items not already in this assembly,
/// added one by one through the parts service.
@MainActor @Observable
internal final class InventoryAddPartsModel: InventoryExistingItemPicking {
    internal let pages: InventoryCandidatePages
    private let parts: InventoryItemPartsModel
    private let store: any InventoryStore

    internal init(parts: InventoryItemPartsModel, store: any InventoryStore) {
        self.parts = parts
        self.store = store
        pages = InventoryCandidatePages(
            store: store, pageQuery: Self.pageQuery(excluding: parts.excludedFromPicker))
    }

    private static func pageQuery(excluding excluded: Set<InventoryItem.ID>)
        -> InventoryCandidatePages.PageQuery
    {
        let filter = InventoryItemPageFilter(excludingIDs: excluded)
        return { text, cursor in
            InventoryStoreCandidate.query(
                text: text, page: InventoryPageRequest(cursor: cursor), filter: { _ in filter })
        }
    }

    internal var title: String { "Add parts" }

    internal func commitTitle(count: Int) -> String {
        count == 0 ? "Add" : "Add \(count)"
    }

    internal func commit() async -> Bool {
        let ids = selected.sorted()
        guard !ids.isEmpty else { return false }
        return await parts.add(ids)
    }

    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }
}
