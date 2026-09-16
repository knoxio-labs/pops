/// One section of a results screen.
internal enum InventorySearchGroup: Identifiable {
    case items([InventorySearchMatch])
    case containers([InventorySearchMatch])
    case locations([InventoryLocationRecord])

    internal var id: String {
        switch self {
        case .items: "items"
        case .containers: "containers"
        case .locations: "locations"
        }
    }

    internal var title: String {
        switch self {
        case .items: "Items"
        case .containers: "Containers"
        case .locations: "Locations"
        }
    }

    internal var count: Int {
        switch self {
        case .items(let matches): matches.count
        case .containers(let matches): matches.count
        case .locations(let locations): locations.count
        }
    }
}

/// The open question POPS-3982 asks visually: whether results read as
/// sections by kind, or as one list ranked by relevance, and, if grouped ,
/// whether a container (an item, ADR-001) counts twice.
internal enum InventorySearchGroupingStyle: Equatable {
    /// Items, containers and locations under their own headers. A container
    /// appears once, in Containers only.
    case byKind
    /// The same headers, but a container also appears in Items, because it
    /// is one.
    case byKindContainersDuplicated
    /// One ranked list, no headers, kinds distinguished only by the row's own
    /// mark.
    case ranked
}

internal enum InventorySearchGrouping {
    /// Sections for ``InventorySearchGroupingStyle/byKind`` and
    /// ``InventorySearchGroupingStyle/byKindContainersDuplicated``. Empty for
    /// ``InventorySearchGroupingStyle/ranked``, whose caller reads
    /// `matches` and `locations` directly instead.
    internal static func groups(
        for matches: [InventorySearchMatch],
        locations: [InventoryLocationRecord],
        style: InventorySearchGroupingStyle
    ) -> [InventorySearchGroup] {
        switch style {
        case .ranked:
            return []
        case .byKind:
            return sections(matches, locations: locations, duplicateContainers: false)
        case .byKindContainersDuplicated:
            return sections(matches, locations: locations, duplicateContainers: true)
        }
    }

    private static func sections(
        _ matches: [InventorySearchMatch],
        locations: [InventoryLocationRecord],
        duplicateContainers: Bool
    ) -> [InventorySearchGroup] {
        let containers = matches.filter { $0.record.kind == .container }
        let items =
            matches.filter { $0.record.kind == .item } + (duplicateContainers ? containers : [])
        var groups: [InventorySearchGroup] = []
        if !items.isEmpty { groups.append(.items(items)) }
        if !containers.isEmpty { groups.append(.containers(containers)) }
        if !locations.isEmpty { groups.append(.locations(locations)) }
        return groups
    }
}
