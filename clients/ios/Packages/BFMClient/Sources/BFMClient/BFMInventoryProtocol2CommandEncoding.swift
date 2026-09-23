import AppCore

extension BFMInventoryCommandEncoding {
    internal static func protocol2ItemWriteOp(for command: InventoryCommand) -> String? {
        switch command {
        case .createProtocol2Item: "item.create"
        case .editProtocol2Item: "item.edit"
        case .changeProtocol2ItemType: "item.changeType"
        default: nil
        }
    }

    internal static func protocol2ItemWriteArgs(
        for command: InventoryCommand
    ) throws -> [String: (any Sendable)?]? {
        switch command {
        case .createProtocol2Item(let item): try ["item": protocol2ItemArgs(item)]
        case .editProtocol2Item(_, _, let values):
            try ["values": protocol2Patches(values)]
        case .changeProtocol2ItemType(_, _, let typeId, let values):
            try ["typeId": typeId, "values": protocol2Values(values)]
        default: nil
        }
    }

    private static func protocol2ItemArgs(
        _ item: InventoryNewProtocol2Item
    ) throws -> [String: (any Sendable)?] {
        try [
            "name": item.name,
            "typeId": item.typeId,
            "values": protocol2Values(item.values),
            "note": item.note,
            "externalIds": externalIdArgs(item.externalIds),
            "quantity": item.quantity,
            "placement": placementArgs(item.placement),
        ]
    }

    private static func protocol2Values(
        _ values: [InventoryProtocol2FieldValue]
    ) throws -> [(any Sendable)?] {
        try values.map { value in
            let encodedValues = try value.values.map(protocol2Value)
            let encoded: [String: (any Sendable)?] = [
                "fieldId": value.fieldId,
                "values": encodedValues,
            ]
            return encoded
        }
    }

    private static func protocol2Patches(
        _ patches: [InventoryProtocol2FieldPatch]
    ) throws -> [(any Sendable)?] {
        try patches.map { patch in
            var encoded: [String: (any Sendable)?] = ["fieldId": patch.fieldId]
            if let values = patch.values {
                encoded["values"] = try values.map(protocol2Value)
            } else {
                encoded.updateValue(nil, forKey: "values")
            }
            return encoded
        }
    }

    private static func protocol2Value(_ value: InventoryPrimitiveValue) throws -> any Sendable {
        switch value {
        case .string(let text): text
        case .integer(let integer): Int(integer.value)
        case .decimal(let decimal): decimal.text
        case .boolean(let value): value
        case .enumeration(let optionId): ["optionId": optionId]
        case .measurement(let amount, let unit): ["amount": amount.text, "unit": unit]
        case .date(let date): date.text
        case .dateTime(let dateTime): dateTime.text
        case .url(let url): url.text
        case .reference(let reference):
            [
                "targetKind": reference.targetKind.rawValue,
                "targetId": reference.targetId,
            ]
        }
    }
}
