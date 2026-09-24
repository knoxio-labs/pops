import AppCore

/// What the form reads from the store, as one query: the catalogue its type
/// picker and field rows are built from, whether the replica is offline (the
/// code assist's offline state), and, when editing, the item as it stands.
internal struct InventoryItemFormContext: Equatable, Sendable {
    internal let catalogue: InventoryCatalogue
    /// The immutable stable-ID catalogue that matches protocol-2 item values.
    internal let protocol2Catalogue: InventoryCatalogueSnapshot?
    internal let protocol2ReferenceTargets: [InventoryProtocol2ReferenceTarget]
    internal let isOffline: Bool
    /// The item being edited; nil for a create, and for an edit whose item
    /// has gone.
    internal let item: InventoryItem?
    /// Each computed field's evaluation reconciled with this phone's own
    /// changes (``InventoryComputedValue/display(in:activeCatalogueRevision:revisionOf:)``), by field
    /// ID. Empty for a create: nothing has been evaluated for an item that
    /// does not exist on the server yet.
    internal let computedDisplays: [String: InventoryComputedDisplay]
    /// What each unavailable computed field is waiting on, named, by field ID.
    internal let computedMissingInputs: [String: [InventoryMissingInput]]
    /// The name of where the item is (edit) or where it was opened from
    /// (create).
    internal let placementName: String?
    /// How far each photo the store staged has got, by hash.
    internal let photoUploads: [String: InventoryPhotoUpload]

    internal static func query(
        for request: InventoryItemFormRequest
    ) -> InventoryQuery<InventoryItemFormContext> {
        InventoryQuery { source in
            let item: InventoryItem?
            let placement: InventoryPlacement?
            switch request {
            case .create(let origin):
                item = nil
                placement = origin
            case .edit(let id):
                item = source.inventoryItem(id: id).flatMap { $0.isDeleted ? nil : $0 }
                placement = item?.placement
            }
            let isOffline: Bool
            if case .offline = source.inventoryReplicaStatus() {
                isOffline = true
            } else {
                isOffline = false
            }
            let displays = computedDisplays(of: item, in: source)
            return InventoryItemFormContext(
                catalogue: source.inventoryCatalogue(),
                protocol2Catalogue: source.inventoryProtocol2Catalogue(),
                protocol2ReferenceTargets: referenceTargets(in: source), isOffline: isOffline,
                item: item, computedDisplays: displays,
                computedMissingInputs: missingInputs(of: item, displays: displays, in: source),
                placementName: placement.flatMap { name(of: $0, in: source) },
                photoUploads: source.inventoryPhotoUploads())
        }
    }

    private static func computedDisplays(
        of item: InventoryItem?, in source: any InventoryQuerySource
    ) -> [String: InventoryComputedDisplay] {
        guard let item else { return [:] }
        let activeRevision = source.inventoryProtocol2Catalogue()?.revision.revision
        return Dictionary(
            uniqueKeysWithValues: item.computedValues.map { computed in
                (
                    computed.fieldId,
                    computed.display(in: item, activeCatalogueRevision: activeRevision) {
                        source.inventoryItem(id: $0)?.revision
                    }
                )
            })
    }

    private static func missingInputs(
        of item: InventoryItem?, displays: [String: InventoryComputedDisplay],
        in source: any InventoryQuerySource
    ) -> [String: [InventoryMissingInput]] {
        guard let item else { return [:] }
        let fields = source.inventoryProtocol2Catalogue()?.types.flatMap(\.fields) ?? []
        var named: [String: [InventoryMissingInput]] = [:]
        for computed in item.computedValues {
            guard case .unavailable? = displays[computed.fieldId] else { continue }
            named[computed.fieldId] = InventoryMissingInputs.named(
                computed, of: item, fields: fields
            ) { source.inventoryItem(id: $0)?.name }
        }
        return named
    }

    private static func referenceTargets(
        in source: any InventoryQuerySource
    ) -> [InventoryProtocol2ReferenceTarget] {
        let items = source.inventoryItems(includeInactive: true).filter { !$0.isDeleted }.map {
            InventoryProtocol2ReferenceTarget(
                kind: .item, id: $0.id, label: $0.name, typeId: $0.typeId)
        }
        let locations = source.inventoryLocationTree().filter { !$0.isDeleted }.map {
            InventoryProtocol2ReferenceTarget(
                kind: .location, id: $0.id, label: $0.name, typeId: nil)
        }
        return items + locations
    }

    /// The item already wearing `code`, other than the one being entered.
    ///
    /// Read through the replica's search, which covers codes, then held to an
    /// exact case-insensitive match: the server's unique index on codes is
    /// case-insensitive too, so "b412" is taken when "B412" is.
    internal static func holder(
        of code: String, excluding itemId: InventoryItem.ID
    ) -> InventoryQuery<InventoryItem?> {
        InventoryQuery { source in
            source.inventorySearch(text: code, includeInactive: true).first {
                $0.id != itemId && $0.code?.caseInsensitiveCompare(code) == .orderedSame
            }
        }
    }

    private static func name(
        of placement: InventoryPlacement, in source: any InventoryQuerySource
    ) -> String? {
        switch placement {
        case .location(let id): source.inventoryLocation(id: id)?.name
        case .container(let id): source.inventoryItem(id: id)?.name
        case .hand: nil
        }
    }
}
