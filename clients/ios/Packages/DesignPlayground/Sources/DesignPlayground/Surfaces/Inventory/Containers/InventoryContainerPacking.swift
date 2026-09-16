/// Which containers are legal "put in" destinations for a given item.
///
/// A container cannot be put into itself or into anything already inside it —
/// either would make a placement chain that never reaches a room. Ordinary
/// items carry no such restriction; only a container can hold the thing being
/// asked about, so only a container needs to be excluded.
internal enum InventoryContainerPacking {
    /// `parents` maps a container's id to the id of the container it sits
    /// directly inside, when it sits inside one at all.
    internal static func validDestinations(
        for itemID: String,
        candidates: [InventoryFoundationItem],
        parents: [String: String]
    ) -> [InventoryFoundationItem] {
        let blocked = descendantIDs(of: itemID, parents: parents).union([itemID])
        return candidates.filter { $0.isContainer && !blocked.contains($0.id) }
    }

    private static func descendantIDs(of itemID: String, parents: [String: String]) -> Set<String> {
        Set(parents.keys.filter { isDescendant($0, of: itemID, parents: parents) })
    }

    private static func isDescendant(
        _ candidate: String, of itemID: String, parents: [String: String]
    ) -> Bool {
        var current = parents[candidate]
        var steps = 0
        while let ancestor = current, steps <= parents.count {
            if ancestor == itemID { return true }
            current = parents[ancestor]
            steps += 1
        }
        return false
    }
}
