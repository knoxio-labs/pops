import Foundation

/// The value vectors served the way the BFM would: live rows on a snapshot
/// page, deleted reference targets as tombstones on the feed page after it,
/// and both catalogue revisions the values name.
internal struct ValueVectorPages {
    private typealias File = ValueVectorFile

    internal let file: ValueVectorFile

    private struct Rows {
        var items: [String: [String: Any]] = [:]
        var locations: [String: [String: Any]] = [:]
    }

    private func rows() throws -> Rows {
        var rows = Rows()
        for vector in file.vectors {
            let item = try File.object(vector["item"])
            rows.items[try File.require(item["id"] as? String, "item id")] = item
            for target in vector["referenceTargets"] as? [Any] ?? [] {
                guard let target = target as? [String: Any] else { continue }
                if let item = target["item"] as? [String: Any], let id = item["id"] as? String {
                    rows.items[id] = item
                }
                if let location = target["location"] as? [String: Any],
                    let id = location["id"] as? String
                {
                    rows.locations[id] = location
                }
            }
        }
        return rows
    }

    private static func encoded(_ rows: [String: [String: Any]], deleted: Bool) throws -> [String] {
        try rows.keys.sorted().compactMap { id in
            guard let row = rows[id], (row["deletedAt"] is String) == deleted else { return nil }
            return try File.json(row)
        }
    }

    /// Scripts `server` so a download stores every vector row and both
    /// catalogues, with the pages pinning `revision` as the active one.
    internal func serve(_ server: ScriptedInventoryServer, pinning revision: Int) async throws {
        let rows = try rows()
        await server.enqueue(
            "snapshot",
            .ok(
                Protocol2Wire.snapshot(
                    items: try Self.encoded(rows.items, deleted: false),
                    locations: try Self.encoded(rows.locations, deleted: false),
                    catalogueRevision: revision, highWaterSeq: 1_000)))
        await server.set(
            "changes",
            .ok(
                Protocol2Wire.changes(
                    items: try Self.encoded(rows.items, deleted: true),
                    locations: try Self.encoded(rows.locations, deleted: true),
                    catalogueRevision: revision, nextSince: 1_001)))
        for held in [file.liveRevision, file.currentRevision] {
            await server.set("catalogue:\(held)", .ok(try file.catalogueJSON(revision: held)))
        }
    }
}
