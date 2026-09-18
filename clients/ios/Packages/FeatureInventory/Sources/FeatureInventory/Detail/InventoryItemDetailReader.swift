import AppCore
import Foundation

extension InventoryItemDetail {
    /// The query Item detail observes: the item, its place, its type's
    /// descriptor, its history and its sync state, read against one state. It
    /// answers nil for an item that is absent or deleted.
    internal static func query(
        id: InventoryItem.ID, now: @escaping @Sendable () -> Date = { .now }
    ) -> InventoryQuery<InventoryItemDetail?> {
        InventoryQuery { InventoryItemDetail(reading: $0, id: id, now: now()) }
    }

    internal init?(
        reading source: any InventoryQuerySource, id: InventoryItem.ID, now: Date,
        calendar: Calendar = .autoupdatingCurrent
    ) {
        guard let item = source.inventoryItem(id: id), !item.isDeleted else { return nil }
        let status = source.inventoryReplicaStatus()
        let ledger = source.inventorySyncLedger()
        let type = item.typeKey.flatMap { source.inventoryCatalogue().type(forKey: $0) }
        let events = source.inventoryItemHistory(itemId: id)
        let fields = InventoryDetailFields(values: item.fields, type: type)
        record = InventoryDetailRecord(
            id: item.id, name: item.name, typeName: type?.name, code: item.code,
            quantity: item.quantity,
            trail: InventoryDetailTrails(source: source).trail(of: item.placement),
            access: item.containment?.access, lifecycle: item.lifecycle,
            sync: InventoryRowSync(status: status, ledger: ledger).sync(of: item.id),
            previous: InventoryPlaceNames(source: source).previousPlace(item.previousPlacement))
        photos = item.photos.map {
            InventoryDetailPhoto(sha256: $0.sha256, caption: $0.caption ?? item.name)
        }
        externalIdentifiers = item.externalIds
        note = item.note
        highlightedFields = fields.highlighted
        otherFields = fields.other
        containerSummary = item.isContainer ? Self.summary(of: id, source: source) : nil
        provenance = item.provenance.map(Self.provenance)
        documents = Self.documents(of: item)
        activity = InventoryActivityEntries(source: source, now: now, calendar: calendar)
            .entries(for: events)
        conflict = ledger.repairs.first { $0.entityId == id }.map(InventoryDetailConflicts.conflict)
        lastSynced = Self.lastSynced(status, now: now)
        lifecycleChange = Self.lifecycleChange(of: item, events: events)
    }

    private static func summary(
        of id: InventoryItem.ID, source: any InventoryQuerySource
    ) -> InventoryContainerSummary {
        let contents = source.inventoryContents(ofContainer: id)
        let containers = contents.filter(\.isContainer).count
        return InventoryContainerSummary(
            itemCount: contents.count - containers, containerCount: containers)
    }

    private static func provenance(_ provenance: InventoryProvenance) -> InventoryDetailProvenance {
        let day = Date.FormatStyle(date: .abbreviated, time: .omitted)
        return InventoryDetailProvenance(
            merchant: provenance.merchant,
            price: provenance.price?.formatted(),
            purchasedOn: provenance.purchasedOn?.formatted(day),
            hasReceipt: provenance.transactionUri != nil,
            warranty: provenance.warrantyExpires.map { "To \($0.formatted(day))" })
    }

    /// A linked status carries its titles; an older server may send them only
    /// in `documentTitles`.
    private static func documents(of item: InventoryItem) -> InventoryDocumentsStatus {
        switch item.documentsStatus {
        case .linked(let titles) where titles.isEmpty && !item.documentTitles.isEmpty:
            .linked(item.documentTitles)
        default:
            item.documentsStatus
        }
    }

    private static func lastSynced(_ status: InventoryReplicaStatus, now: Date) -> String? {
        guard case .stale(let lastRefreshAt) = status, let lastRefreshAt else { return nil }
        return InventoryRelativeTime.text(lastRefreshAt, now: now)
    }

    /// When the item stopped counting, and the reason the latest
    /// lifecycle-changed event recorded. The item itself carries no reason
    /// field, so that detail only ever comes from the event history.
    private static func lifecycleChange(
        of item: InventoryItem, events: [InventoryEvent]
    ) -> InventoryLifecycleChange? {
        guard item.lifecycle != .active else { return nil }
        let latest = events.filter { $0.kind == .lifecycleChanged }.max { $0.seq < $1.seq }
        guard let changedAt = item.lifecycleChangedAt ?? latest?.serverTime else { return nil }
        return InventoryLifecycleChange(
            lifecycle: item.lifecycle, changedAt: changedAt, reason: latest?.reason)
    }
}

/// Walks a placement into the names Item detail's placement line shows.
internal struct InventoryDetailTrails {
    /// The same guard the dashboard's walk uses: a chain deeper than the
    /// server would ever store is corrupt, and stopping beats spinning.
    private static let maximumDepth = 32

    internal let source: any InventoryQuerySource

    internal func trail(of placement: InventoryPlacement) -> InventoryDetailTrail {
        let holder: InventoryRoute
        switch placement {
        case .hand: return .inHand
        case .location(let id): holder = .place(id)
        case .container(let id): holder = .container(id)
        }
        var containers: [String] = []
        var current = placement
        walk: for _ in 0..<Self.maximumDepth {
            switch current {
            case .location(let id):
                let room = liveLocation(id).map { [$0.name] } ?? []
                return InventoryDetailTrail(
                    crumbs: room + containers.reversed(), isInHand: false, holder: holder)
            case .container(let id):
                guard let container = liveItem(id) else { break walk }
                containers.append(container.name)
                current = container.placement
            case .hand:
                break walk
            }
        }
        return InventoryDetailTrail(crumbs: containers.reversed(), isInHand: false, holder: holder)
    }

    private func liveLocation(_ id: InventoryLocation.ID) -> InventoryLocation? {
        source.inventoryLocation(id: id).flatMap { $0.isDeleted ? nil : $0 }
    }

    private func liveItem(_ id: InventoryItem.ID) -> InventoryItem? {
        source.inventoryItem(id: id).flatMap { $0.isDeleted ? nil : $0 }
    }
}
