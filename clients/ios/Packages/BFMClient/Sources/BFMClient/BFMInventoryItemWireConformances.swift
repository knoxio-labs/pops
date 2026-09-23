import AppCore
import OpenAPIRuntime

extension Operations.MobileInventory_snapshot.Output.Ok.Body.JsonPayload.ItemsPayloadPayload:
    WireInventoryItem
{
    internal var protocol2FieldValues: [WireProtocol2FieldValue] {
        return fieldValues.map {
            let source: InventoryValueSource
            switch $0.source {
            case .stored: source = .stored
            case .override: source = .override
            }
            return WireProtocol2FieldValue(
                fieldId: $0.fieldId,
                source: source,
                catalogueRevision: $0.catalogueRevision,
                values: $0.values
            )
        }
    }

    internal var fieldsAdditionalProperties: [String: OpenAPIRuntime.OpenAPIValueContainer] {
        fields.additionalProperties
    }

    internal var externalIdPairs: [WireExternalIdPair] {
        externalIds.map { WireExternalIdPair(kind: $0.kind, value: $0.value) }
    }

    internal var accessRaw: String? {
        switch access {
        case .open: "open"
        case .closed: "closed"
        case ._empty_, nil: nil
        }
    }

    internal var isFullFlag: Bool { isFull ?? false }

    internal var photoPairs: [WirePhotoPair] {
        photos.map { WirePhotoPair(sha256: $0.sha256, caption: $0.caption) }
    }

    internal var provenanceRow: WireProvenanceRow? {
        guard let provenance else { return nil }
        return WireProvenanceRow(
            merchant: provenance.merchant, price: provenance.price,
            purchasedOn: provenance.purchasedOn, warrantyExpires: provenance.warrantyExpires,
            transactionUri: provenance.transactionUri
        )
    }

    internal var documentsStatusRaw: String { documentsStatus.rawValue }
}

extension Operations.MobileInventory_changes.Output.Ok.Body.JsonPayload.ItemsPayloadPayload:
    WireInventoryItem
{
    internal var protocol2FieldValues: [WireProtocol2FieldValue] {
        return fieldValues.map {
            let source: InventoryValueSource
            switch $0.source {
            case .stored: source = .stored
            case .override: source = .override
            }
            return WireProtocol2FieldValue(
                fieldId: $0.fieldId,
                source: source,
                catalogueRevision: $0.catalogueRevision,
                values: $0.values
            )
        }
    }

    internal var fieldsAdditionalProperties: [String: OpenAPIRuntime.OpenAPIValueContainer] {
        fields.additionalProperties
    }

    internal var externalIdPairs: [WireExternalIdPair] {
        externalIds.map { WireExternalIdPair(kind: $0.kind, value: $0.value) }
    }

    internal var accessRaw: String? {
        switch access {
        case .open: "open"
        case .closed: "closed"
        case ._empty_, nil: nil
        }
    }

    internal var isFullFlag: Bool { isFull ?? false }

    internal var photoPairs: [WirePhotoPair] {
        photos.map { WirePhotoPair(sha256: $0.sha256, caption: $0.caption) }
    }

    internal var provenanceRow: WireProvenanceRow? {
        guard let provenance else { return nil }
        return WireProvenanceRow(
            merchant: provenance.merchant, price: provenance.price,
            purchasedOn: provenance.purchasedOn, warrantyExpires: provenance.warrantyExpires,
            transactionUri: provenance.transactionUri
        )
    }

    internal var documentsStatusRaw: String { documentsStatus.rawValue }
}
