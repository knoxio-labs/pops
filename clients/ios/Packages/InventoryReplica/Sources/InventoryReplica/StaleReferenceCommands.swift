import AppCore

extension InventoryCommand {
    /// Whether this is a protocol-2 new item, edit or type change writing at
    /// least one reference value: the changes a stale reference repairs.
    var carriesReferenceValue: Bool {
        let values: [[InventoryPrimitiveValue]] =
            switch self {
            case .createProtocol2Item(let item): item.values.map(\.values)
            case .editProtocol2Item(_, _, let patches): patches.compactMap(\.values)
            case .changeProtocol2ItemType(_, _, _, let values): values.map(\.values)
            default: []
            }
        return values.joined().contains { value in
            if case .reference = value { return true }
            return false
        }
    }
}
