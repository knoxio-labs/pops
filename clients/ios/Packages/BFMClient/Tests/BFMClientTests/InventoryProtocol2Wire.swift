import Foundation

/// Protocol-2 bodies for the replica-through-transport suites: an exact
/// catalogue revision as `/mobile/inventory/type-catalogue` answers it, and
/// sync pages that pin one. Shapes follow
/// `pillars/inventory/src/contract/rest-catalogue-schemas.ts` and
/// `rest-sync.ts`.
internal enum Protocol2Wire {
    internal static let bulbType = "59538480-6e82-5ccc-b7be-f1cfd15b9af6"
    internal static let lumens = "147a262c-bb7c-51bf-b617-16d354228d91"
    internal static let brightness = "3f1d8c2a-7b64-4e19-9a0e-5c2b7d4e8f61"
    internal static let efficacy = "2d8a3c1e-5b7f-4e2a-9c61-0f3d2b8a7e14"
    internal static let lampId = "6c0a2f6e-9d1b-4f3a-8e57-1b2c3d4e5f60"

    /// One catalogue field. `kind` is a string so a test can send one this
    /// build has never heard of. An option with no entry in
    /// `enumOptionLabels` is labelled `Option <index>`. `defaultValues` is the
    /// key's raw JSON; nil leaves the key out, as a server predating it does.
    internal static func field(
        id: String, key: String, label: String, kind: String = "measurement",
        storage: String = "stored", required: Bool = false, archivedAt: String? = nil,
        replacedBy: String? = nil, sortOrder: Int = 0, cardinality: String = "one",
        fixedUnit: String? = nil, referenceKinds: [String] = [], enumOptionIds: [String] = [],
        enumOptionLabels: [String] = [], defaultValues: String? = nil
    ) -> String {
        let kinds = referenceKinds.map { "\"\($0)\"" }.joined(separator: ",")
        let options = enumOptionIds.enumerated().map { index, optionId -> String in
            let optionLabel =
                enumOptionLabels.indices.contains(index)
                ? enumOptionLabels[index] : "Option \(index)"
            return """
                {"id":"\(optionId)","key":"option-\(index)","label":"\(optionLabel)",\
                "sortOrder":\(index),"archivedAt":null}
                """
        }.joined(separator: ",")
        return """
            {"id":"\(id)","typeId":"\(bulbType)","key":"\(key)","label":"\(label)","help":null,\
            "sortOrder":\(sortOrder),"kind":"\(kind)","cardinality":"\(cardinality)",\
            "required":\(required),"storage":"\(storage)",\
            "fixedUnit":\(fixedUnit.map { "\"\($0)\"" } ?? "null"),\
            "referenceKinds":[\(kinds)],"referenceTypeIds":[],\
            "expressionVersion":null,"expression":null,"allowOverride":false,\
            \(defaultValues.map { "\"defaultValues\":\($0)," } ?? "")"presentation":{},\
            "archivedAt":\(archivedAt.map { "\"\($0)\"" } ?? "null"),\
            "replacedBy":\(replacedBy.map { "\"\($0)\"" } ?? "null"),"enumOptions":[\(options)]}
            """
    }

    internal static let efficacyField = field(
        id: efficacy, key: "efficacy", label: "Efficacy", kind: "integer", storage: "computed",
        sortOrder: 1)

    /// The fields of the Bulb type at the first revision these suites use.
    internal static let bulbFields = [
        field(id: lumens, key: "lumens", label: "Lumens", fixedUnit: "lm"),
        efficacyField,
    ]

    /// `Lumens` relabelled `Brightness`: same id, kind and cardinality.
    internal static let renamedFields = [
        field(id: lumens, key: "lumens", label: "Brightness", fixedUnit: "lm"),
        efficacyField,
    ]

    /// `Lumens` archived and replaced by a new `Brightness` field.
    internal static let replacedFields = [
        field(
            id: lumens, key: "lumens", label: "Lumens", archivedAt: "2026-09-02T00:00:00.000Z",
            fixedUnit: "lm"),
        field(
            id: brightness, key: "brightness", label: "Brightness", sortOrder: 2, fixedUnit: "lm"),
        efficacyField,
    ]

    /// `Lumens` archived with the catalogue recording the new `Brightness`
    /// field, of the same kind, as its replacement.
    internal static let lineageFields = [
        field(
            id: lumens, key: "lumens", label: "Lumens", archivedAt: "2026-09-02T00:00:00.000Z",
            replacedBy: brightness, fixedUnit: "lm"),
        field(
            id: brightness, key: "brightness", label: "Brightness", sortOrder: 2, fixedUnit: "lm"),
        efficacyField,
    ]

    internal static func catalogue(
        revision: Int, minimumProtocol: Int = 2, fields: [String] = bulbFields
    ) -> String {
        """
        {"revision":{"revision":\(revision),\
        "baseRevision":\(revision > 1 ? String(revision - 1) : "null"),"status":"published",\
        "minimumProtocol":\(minimumProtocol),\
        "created":{"actor":{"kind":"web","label":"Web"},"at":"2026-09-01T00:00:00.000Z"},\
        "published":null,"abandoned":null},\
        "types":[{"revision":\(revision),"id":"\(bulbType)","key":"bulb","label":"Bulb",\
        "description":null,"sortOrder":0,"capabilities":[],"legacyLabels":[],"presentation":{},\
        "archivedAt":null,"fields":[\(fields.joined(separator: ","))]}]}
        """
    }

    /// A protocol-2 lamp with a stored lumens value and a computed efficacy.
    internal static func lamp(
        id: String = lampId, revision: Int = 1, seq: Int = 1, catalogueRevision: Int = 2,
        amount: String = "800", name: String = "Lamp"
    ) -> String {
        InventoryWire.item(
            id: id, revision: revision, seq: seq, name: name, typeId: bulbType,
            catalogueRevision: catalogueRevision,
            fieldValues: """
                [{"fieldId":"\(lumens)","source":"stored","catalogueRevision":\(catalogueRevision),\
                "values":[{"amount":"\(amount)","unit":"lm"}]}]
                """,
            computedValues: """
                [{"fieldId":"\(efficacy)","source":"computed",\
                "catalogueRevision":\(catalogueRevision),"state":"ok","values":[80],\
                "dependencies":[{"itemId":"\(id)","fieldId":"\(lumens)","revision":\(revision)}],\
                "traversedItemIds":["\(id)"]}]
                """)
    }

    internal static func snapshot(
        items: [String], locations: [String] = [], catalogueRevision: Int?,
        minimumProtocol: Int = 2, highWaterSeq: Int = 10, nextCursor: String? = nil
    ) -> String {
        """
        {"epoch":"epoch-1","highWaterSeq":\(highWaterSeq),"minimumProtocol":\(minimumProtocol),\
        "catalogueVersion":"v1","total":\(items.count),\
        "catalogueRevision":\(catalogueRevision.map(String.init) ?? "null"),\
        "items":[\(items.joined(separator: ","))],"locations":[\(locations.joined(separator: ","))],\
        "nextCursor":\(nextCursor.map { "\"\($0)\"" } ?? "null")}
        """
    }

    internal static func changes(
        items: [String] = [], locations: [String] = [], catalogueRevision: Int?,
        minimumProtocol: Int = 2, nextSince: Int = 11
    ) -> String {
        """
        {"epoch":"epoch-1","minimumProtocol":\(minimumProtocol),\
        "items":[\(items.joined(separator: ","))],"locations":[\(locations.joined(separator: ","))],\
        "events":[],\
        "nextSince":\(nextSince),"hasMore":false,"catalogueVersion":"v1",\
        "catalogueRevision":\(catalogueRevision.map(String.init) ?? "null")}
        """
    }
}
