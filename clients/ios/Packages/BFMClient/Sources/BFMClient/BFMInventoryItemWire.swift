import AppCore
import Foundation
import OpenAPIRuntime

/// One item, generic over whichever operation produced its type (`snapshot`
/// or `changes` — ADR-033 gives each its own nominal type for an identical
/// shape). Nested substructures (`externalIds`, `photos`, `provenance`) are
/// read as small structs here rather than through further associated types:
/// their own shapes never vary field for field, so there is nothing left for
/// a second protocol to buy.
internal protocol WireInventoryItem {
    associatedtype Placement: WirePlacementValue
    associatedtype PreviousPlacement: WirePreviousPlacementValue

    var id: String { get }
    var revision: Int { get }
    var seq: Int { get }
    var name: String { get }
    var typeId: String? { get }
    var catalogueRevision: Int? { get }
    var protocol2FieldValues: [WireProtocol2FieldValue] { get }
    func computedValueRows() throws -> [WireComputedValue]
    var typeKey: String? { get }
    var legacyType: String? { get }
    var fieldsAdditionalProperties: [String: OpenAPIValueContainer] { get }
    var note: String? { get }
    var code: String? { get }
    var externalIdPairs: [WireExternalIdPair] { get }
    var quantity: Int { get }
    var lifecycle: String { get }
    var lifecycleChangedAt: String? { get }
    var placement: Placement { get }
    var previousPlacement: PreviousPlacement? { get }
    var isContainer: Bool { get }
    var accessRaw: String? { get }
    /// Already defaulted to `false` by the conforming type: the wire's own
    /// `isFull` is nullable only because a non-container carries no fullness
    /// at all, never because a container's is unknown.
    var isFullFlag: Bool { get }
    var photoPairs: [WirePhotoPair] { get }
    var provenanceRow: WireProvenanceRow? { get }
    var documentsStatusRaw: String { get }
    var documentTitles: [String] { get }
    var createdAt: String { get }
    var updatedAt: String { get }
    var deletedAt: String? { get }
}

/// One `externalIds` entry, independent of which operation produced it.
internal struct WireExternalIdPair {
    internal let kind: String
    internal let value: String
}

/// One `photos` entry, independent of which operation produced it.
internal struct WirePhotoPair {
    internal let sha256: String
    internal let caption: String?
}

/// An item's `provenance`, independent of which operation produced it.
internal struct WireProvenanceRow {
    internal let merchant: String?
    internal let price: Double?
    internal let purchasedOn: String?
    internal let warrantyExpires: String?
    internal let transactionUri: String?
}

/// Maps one generated item row into ``InventoryItem``.
///
/// - Parameter timeZone: The zone `provenance.purchasedOn`/`warrantyExpires`
///   (day-only wire values) are read in.
/// - Throws: ``RepositoryError/contractMismatch`` for a `createdAt`/`updatedAt`
///   this build cannot parse — every item carries both, so there is no
///   partial reading of a row that fails this.
internal func inventoryItem<Item: WireInventoryItem>(
    from wire: Item, timeZone: TimeZone
) throws -> InventoryItem {
    guard let createdAt = ISO8601Instant.parse(wire.createdAt),
        let updatedAt = ISO8601Instant.parse(wire.updatedAt)
    else { throw RepositoryError.contractMismatch }

    return InventoryItem(
        id: wire.id,
        revision: wire.revision,
        seq: wire.seq,
        catalogueRevision: wire.catalogueRevision,
        name: wire.name,
        typeId: wire.typeId,
        typeKey: wire.typeKey,
        fieldValues: try protocol2FieldValues(from: wire.protocol2FieldValues),
        computedValues: try wire.computedValueRows().map {
            try $0.domainValue(evaluatedItemRevision: wire.revision)
        },
        legacyType: wire.legacyType,
        fields: customFields(from: wire.fieldsAdditionalProperties),
        note: wire.note,
        code: wire.code,
        externalIds: wire.externalIdPairs.map {
            InventoryExternalIdentifier(kind: $0.kind, value: $0.value)
        },
        quantity: InventoryQuantity(count: wire.quantity),
        lifecycle: InventoryLifecycle(wire: wire.lifecycle),
        lifecycleChangedAt: wire.lifecycleChangedAt.flatMap(ISO8601Instant.parse),
        placement: InventoryPlacement(wire.placement.wire),
        previousPlacement: wire.previousPlacement.map { InventoryPreviousPlacement($0.wire) },
        containment: containment(
            isContainer: wire.isContainer, access: wire.accessRaw, isFull: wire.isFullFlag),
        photos: wire.photoPairs.map {
            InventoryPhotoReference(sha256: $0.sha256, caption: $0.caption)
        },
        provenance: wire.provenanceRow.map { provenance(from: $0, timeZone: timeZone) },
        documentsStatus: documentsStatus(wire.documentsStatusRaw, titles: wire.documentTitles),
        documentTitles: wire.documentTitles,
        createdAt: createdAt,
        updatedAt: updatedAt,
        deletedAt: wire.deletedAt.flatMap(ISO8601Instant.parse)
    )
}

/// One generated protocol-2 field row, reduced to the stable wire facts the
/// hand-written transport owns across snapshot and change response types.
internal struct WireProtocol2FieldValue {
    internal let fieldId: String
    internal let source: InventoryValueSource
    internal let catalogueRevision: Int
    internal let values: [OpenAPIValueContainer]
}

private func customFields(
    from additionalProperties: [String: OpenAPIValueContainer]
) -> [String: InventoryFieldValue] {
    additionalProperties.compactMapValues(BFMInventoryFieldValueWire.decode)
}

private func containment(isContainer: Bool, access: String?, isFull: Bool) -> InventoryContainment?
{
    guard isContainer else { return nil }
    return InventoryContainment(
        access: access.map(InventoryAccess.init(wire:)) ?? .open, isFull: isFull)
}

private func provenance(from wire: WireProvenanceRow, timeZone: TimeZone) -> InventoryProvenance {
    // `price` carries no currency on this route (`MobileInventoryProvenanceSchema`
    // has none): every inventory item in this household is priced in AUD, so
    // that is the code assumed here rather than threaded through as a
    // parameter every call site would otherwise have to supply. A federation
    // that priced inventory in more than one currency would need this route
    // to say which.
    InventoryProvenance(
        merchant: wire.merchant,
        price: wire.price.flatMap { MoneyAmount(majorUnits: Decimal($0), currencyCode: "AUD") },
        purchasedOn: wire.purchasedOn.flatMap { ISO8601Day.parse($0, in: timeZone) },
        warrantyExpires: wire.warrantyExpires.flatMap { ISO8601Day.parse($0, in: timeZone) },
        transactionUri: wire.transactionUri
    )
}

private func documentsStatus(_ wire: String, titles: [String]) -> InventoryDocumentsStatus {
    switch wire {
    case "linked": .linked(titles)
    case "unavailable": .unavailable
    default: .none
    }
}
