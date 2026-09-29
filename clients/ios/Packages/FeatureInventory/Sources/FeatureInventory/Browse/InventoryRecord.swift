import AppCore
import Foundation

/// An item or container as a list row reads it: the item's own facts plus
/// what reading it against the rest of the replica adds, its type's name,
/// where it is as a path, and its sync state.
internal struct InventoryRecord: Identifiable, Equatable, Sendable {
    /// Which of the three placements the row is in, as the filter narrows it.
    internal enum Placement: Equatable, Sendable {
        case location
        case container
        case hand
    }

    internal let id: InventoryItem.ID
    internal let name: String
    internal let typeKey: String?
    internal let typeKeys: Set<String>
    /// The catalogue's name for the item's type, or its legacy key when this
    /// phone's catalogue does not know that type yet.
    internal let typeName: String?
    internal let code: String?
    internal let quantity: InventoryQuantity
    internal let lifecycle: InventoryLifecycle
    /// Set exactly when the item is a container.
    internal let access: InventoryAccess?
    internal let placement: Placement
    /// Where it is: the effective location, then each container outermost
    /// first. Empty when nothing places it.
    internal let path: [String]
    internal let sync: InventorySync
    /// The first photo's content hash, for the row's thumbnail.
    internal let photo: String?
    internal let createdAt: Date

    internal var isContainer: Bool { access != nil }
    internal var isActive: Bool { lifecycle == .active }

    /// Where the record is, as one line a row can wrap.
    internal var placementLine: String {
        if placement == .hand { return "In hand" }
        return path.isEmpty ? "Unplaced" : path.joined(separator: " › ")
    }

    /// The type and the placement, the row's second line.
    internal var detailLine: String {
        [typeName ?? "No type", placementLine].joined(separator: " · ")
    }

    /// Added within the last week, the Items browser's "This week" and its
    /// Recent count.
    internal func isRecent(now: Date) -> Bool {
        now.timeIntervalSince(createdAt) <= Self.recentWindow
    }

    private static let recentWindow: TimeInterval = 7 * 24 * 60 * 60
}

internal enum InventoryTypeNameResolver {
    internal static func name(
        for item: InventoryItem, catalogue: InventoryCatalogue,
        protocol2Catalogue: InventoryCatalogueSnapshot?
    ) -> String? {
        if let protocol2Catalogue {
            let type =
                item.typeId.flatMap { typeId in
                    protocol2Catalogue.types.first { $0.id == typeId }
                }
                ?? item.typeKey.flatMap { typeKey in
                    protocol2Catalogue.types.first { $0.key == typeKey }
                }
            if let type {
                return protocol2Catalogue.effectiveType(id: type.id)?.label ?? type.label
            }
        }
        return item.typeKey.map { catalogue.type(forKey: $0)?.name ?? $0 }
    }
}

/// Builds records from one state of the store, so every row on a screen is
/// read against the same catalogue, ledger and placements.
internal struct InventoryRecordReader {
    private let places: InventoryPlaceNames
    private let catalogue: InventoryCatalogue
    private let protocol2Catalogue: InventoryCatalogueSnapshot?
    private let rowSync: InventoryRowSync

    internal init(source: any InventoryQuerySource) {
        places = InventoryPlaceNames(source: source)
        catalogue = source.inventoryCatalogue()
        protocol2Catalogue = source.inventoryProtocol2Catalogue()
        rowSync = InventoryRowSync(
            status: source.inventoryReplicaStatus(), ledger: source.inventorySyncLedger())
    }

    internal func record(_ item: InventoryItem) -> InventoryRecord {
        InventoryRecord(
            id: item.id, name: item.name, typeKey: item.typeKey,
            typeKeys: Self.typeKeys(for: item, in: protocol2Catalogue),
            typeName: InventoryTypeNameResolver.name(
                for: item, catalogue: catalogue, protocol2Catalogue: protocol2Catalogue),
            code: item.code, quantity: item.quantity, lifecycle: item.lifecycle,
            access: item.containment?.access, placement: placement(item.placement),
            path: places.path(of: item.placement), sync: rowSync.sync(of: item.id),
            photo: item.photos.first?.sha256, createdAt: item.createdAt)
    }

    private static func typeKeys(
        for item: InventoryItem, in catalogue: InventoryCatalogueSnapshot?
    ) -> Set<String> {
        guard let catalogue else { return item.typeKey.map { [$0] } ?? [] }
        let found =
            item.typeId.flatMap { typeId in
                catalogue.types.first { $0.id == typeId }
            }
            ?? item.typeKey.flatMap { typeKey in
                catalogue.types.first { $0.key == typeKey }
            }
        guard let found else { return item.typeKey.map { [$0] } ?? [] }
        return Set(catalogue.ancestry(ofType: found.id).map(\.key))
    }

    /// The catalogue's type names, alphabetically, for the filter sheet.
    internal var typeNames: [InventoryTypeName] {
        if let protocol2Catalogue {
            return protocol2Catalogue.types
                .map { type in
                    let ancestry = protocol2Catalogue.ancestry(ofType: type.id)
                    return InventoryTypeName(
                        key: type.key, name: type.label,
                        parentKey: ancestry.dropLast().last?.key,
                        iconToken: protocol2Catalogue.iconToken(for: type.id))
                }
                .sorted(by: Self.typeNameOrder)
        }
        return catalogue.types
            .map { InventoryTypeName(key: $0.key, name: $0.name) }
            .sorted(by: Self.typeNameOrder)
    }

    private static func typeNameOrder(_ left: InventoryTypeName, _ right: InventoryTypeName) -> Bool
    {
        switch left.name.localizedCaseInsensitiveCompare(right.name) {
        case .orderedAscending: true
        case .orderedDescending: false
        case .orderedSame:
            left.key.localizedCaseInsensitiveCompare(right.key) == .orderedAscending
        }
    }

    private func placement(_ placement: InventoryPlacement) -> InventoryRecord.Placement {
        switch placement {
        case .location: .location
        case .container: .container
        case .hand: .hand
        }
    }
}

/// A type the filter sheet offers: the key a record carries and the name a
/// person reads.
public struct InventoryTypeName: Identifiable, Hashable, Sendable {
    /// The stable catalogue key carried by records.
    public let key: String
    /// The reader-facing catalogue name.
    public let name: String
    /// The stable key of this type's protocol-2 parent, or nil for a root.
    public let parentKey: String?
    /// The semantic icon token resolved from this type's catalogue metadata.
    public let iconToken: InventoryCatalogueIconToken

    public var id: String { key }

    /// Creates a type option from its catalogue key and display name.
    public init(
        key: String, name: String, parentKey: String? = nil,
        iconToken: InventoryCatalogueIconToken = .item
    ) {
        self.key = key
        self.name = name
        self.parentKey = parentKey
        self.iconToken = iconToken
    }
}
