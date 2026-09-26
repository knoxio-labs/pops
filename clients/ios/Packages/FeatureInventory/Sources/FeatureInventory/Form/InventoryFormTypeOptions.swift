import AppCore

/// One entry of the item form's Type tree.
internal struct InventoryFormTypeOption: Identifiable, Equatable {
    internal let id: String
    internal let label: String
    internal let parentID: String?
    internal let path: String
    internal let depth: Int
    internal let isArchived: Bool
    internal let hasChildren: Bool

    internal init(
        id: String, label: String, parentID: String? = nil, path: String? = nil,
        depth: Int = 0, isArchived: Bool = false, hasChildren: Bool = false
    ) {
        self.id = id
        self.label = label
        self.parentID = parentID
        self.path = path ?? label
        self.depth = depth
        self.isArchived = isArchived
        self.hasChildren = hasChildren
    }

    /// The option's handle for a driver: its words are owner-authored and
    /// may repeat, its id never does.
    internal var accessibilityIdentifier: String {
        InventoryAccessibility.itemTypeOption(id: id)
    }
}

/// Builds the type tree and its flattened search results for a form or filter.
internal enum InventoryFormTypeOptions {
    /// The active protocol-2 root types, plus a selected archived root.
    internal static func protocol2(
        _ catalogue: InventoryCatalogueSnapshot, selectedId: String?
    ) -> [InventoryFormTypeOption] {
        protocol2All(catalogue, selectedId: selectedId).filter { $0.parentID == nil }
    }

    /// Every active protocol-2 type, plus a selected archived type, with its
    /// parent and complete display path resolved.
    internal static func protocol2All(
        _ catalogue: InventoryCatalogueSnapshot, selectedId: String?
    ) -> [InventoryFormTypeOption] {
        alphabeticallyByPath(
            catalogue.types.compactMap { type in
                guard type.archivedAt == nil || type.id == selectedId else { return nil }
                let ancestry = catalogue.ancestry(ofType: type.id)
                let effective = catalogue.effectiveType(id: type.id) ?? type
                let parentID = ancestry.dropLast().last?.id
                let path = ancestry.map(\.label).joined(separator: " › ")
                let hasChildren = catalogue.types.contains { child in
                    child.archivedAt == nil
                        && child.parentTypeId == type.id
                        && catalogue.type(child.id, isOrDescendsFrom: type.id)
                }
                return InventoryFormTypeOption(
                    id: type.id, label: effective.label, parentID: parentID,
                    path: path, depth: max(ancestry.count - 1, 0),
                    isArchived: type.archivedAt != nil, hasChildren: hasChildren)
            })
    }

    /// The direct children of a protocol-2 parent, in display order.
    internal static func children(
        of parentID: String, in catalogue: InventoryCatalogueSnapshot, selectedId: String?
    ) -> [InventoryFormTypeOption] {
        protocol2All(catalogue, selectedId: selectedId).filter { $0.parentID == parentID }
    }

    /// Every matching protocol-2 type, displayed by its complete ancestry path.
    internal static func search(
        _ catalogue: InventoryCatalogueSnapshot, query: String, selectedId: String?
    ) -> [InventoryFormTypeOption] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }
        return alphabeticallyByPath(
            protocol2All(catalogue, selectedId: selectedId).filter {
                $0.path.localizedCaseInsensitiveContains(query)
            })
    }

    /// A protocol-1 catalogue's types, keyed by type key.
    internal static func legacy(_ types: [InventoryType]) -> [InventoryFormTypeOption] {
        alphabetically(types.map { InventoryFormTypeOption(id: $0.key, label: $0.name) })
    }

    /// A filter's type names, retaining their protocol-2 parent relationships.
    internal static func filter(_ types: [InventoryTypeName]) -> [InventoryFormTypeOption] {
        let byKey = Dictionary(uniqueKeysWithValues: types.map { ($0.key, $0) })
        return alphabeticallyByPath(
            types.map { type in
                let ancestry = filterAncestry(of: type.key, in: byKey)
                return InventoryFormTypeOption(
                    id: type.key, label: type.name, parentID: type.parentKey,
                    path: ancestry.map(\.name).joined(separator: " › "),
                    depth: max(ancestry.count - 1, 0),
                    hasChildren: types.contains { $0.parentKey == type.key })
            })
    }

    private static func alphabetically(
        _ options: [InventoryFormTypeOption]
    ) -> [InventoryFormTypeOption] {
        options.sorted { left, right in
            switch left.label.localizedCaseInsensitiveCompare(right.label) {
            case .orderedAscending: true
            case .orderedDescending: false
            case .orderedSame:
                left.id.localizedCaseInsensitiveCompare(right.id) == .orderedAscending
            }
        }
    }

    private static func alphabeticallyByPath(
        _ options: [InventoryFormTypeOption]
    ) -> [InventoryFormTypeOption] {
        options.sorted { left, right in
            switch left.path.localizedCaseInsensitiveCompare(right.path) {
            case .orderedAscending: true
            case .orderedDescending: false
            case .orderedSame:
                left.id.localizedCaseInsensitiveCompare(right.id) == .orderedAscending
            }
        }
    }

    private static func filterAncestry(
        of key: String, in types: [String: InventoryTypeName]
    ) -> [InventoryTypeName] {
        guard let type = types[key] else { return [] }
        var visited: Set<String> = []
        var ancestry: [InventoryTypeName] = []
        var current: InventoryTypeName? = type
        while let type = current, visited.insert(type.key).inserted {
            ancestry.append(type)
            current = type.parentKey.flatMap { types[$0] }
        }
        return ancestry.reversed()
    }
}
