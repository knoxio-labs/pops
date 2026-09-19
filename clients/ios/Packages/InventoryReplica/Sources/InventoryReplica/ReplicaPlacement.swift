import AppCore
import GRDB

/// ADR-002 D2's walk, on the phone: effective location is derived by
/// following `containing_item_id` outward and is never stored, so moving a
/// container writes one row and everything inside it follows without a
/// revision of its own changing.
internal enum ReplicaPlacement {
    /// The server rejects a containment chain deeper than this (D2), so a
    /// longer one here can only be a cycle the replica was sent mid-repair.
    /// The walk stops rather than looping.
    static let maximumDepth = 32

    static func trail(ofItem id: String, in db: Database) throws -> InventoryPlacementTrail? {
        guard let item = try ReplicaQueries.item(id: id, in: db) else { return nil }
        switch item.placement {
        case .location(let location): return .direct(location: location)
        case .hand: return .inHand(previous: item.previousPlacement)
        case .container(let container): return try walk(from: container, in: db)
        }
    }

    private static func walk(from container: String, in db: Database) throws
        -> InventoryPlacementTrail
    {
        var chain = [container]
        var current = container
        while chain.count <= maximumDepth {
            let row = try Row.fetchOne(
                db,
                sql:
                    "SELECT placement_kind, location_id, containing_item_id FROM item WHERE id = ?",
                arguments: [current])
            let kind: String? = try row?.decode(forColumn: "placement_kind")
            let location: String? = try row?.decode(forColumn: "location_id")
            let next: String? = try row?.decode(forColumn: "containing_item_id")
            guard kind == "container", let next, !chain.contains(next) else {
                return .contained(location: location, containers: chain.reversed())
            }
            chain.append(next)
            current = next
        }
        return .contained(location: nil, containers: chain.reversed())
    }

    /// Every live, active item whose walk ends at `locationId`: placed there
    /// directly, or inside a container that is, however deeply nested. The
    /// walk passes through inactive and deleted containers (ADR-002's open
    /// question 2 default keeps contents active inside an inactive
    /// container), and only the items it returns are filtered.
    static func contents(ofLocation locationId: String, in db: Database) throws -> [InventoryItem] {
        let rows = try Row.fetchAll(
            db,
            sql: """
                WITH RECURSIVE reach(id) AS (
                    SELECT id FROM item WHERE placement_kind = 'location' AND location_id = ?
                    UNION
                    SELECT item.id FROM item JOIN reach ON item.containing_item_id = reach.id
                )
                SELECT item.* FROM item JOIN reach USING (id)
                WHERE item.deleted_at IS NULL AND item.lifecycle = 'active'
                ORDER BY item.name COLLATE NOCASE, item.id
                """,
            arguments: [locationId])
        return try rows.map { try ItemRow.decode($0, in: db) }
    }
}
