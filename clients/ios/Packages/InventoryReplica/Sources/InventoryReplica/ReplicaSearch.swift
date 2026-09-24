import AppCore
import Foundation
import GRDB

/// The searchable text of one item, per ADR-002's `items_fts` columns: name,
/// code, note, type label, the text of its field values, and its external
/// identifiers.
internal struct SearchDocument {
    let id: String
    let name: String
    let code: String?
    let note: String?
    let typeKey: String?
    let fields: [String: InventoryFieldValue]
    let fieldValues: [InventoryItemFieldEntry]
    let computedValues: [InventoryComputedValue]
    let externalIds: [InventoryExternalIdentifier]

    init(_ item: InventoryItem) {
        id = item.id
        name = item.name
        code = item.code
        note = item.note
        typeKey = item.typeKey
        fields = item.fields
        fieldValues = item.fieldValues
        computedValues = item.computedValues
        externalIds = item.externalIds
    }

    /// The protocol-1 fields' text, then the protocol-2 values'.
    func fieldText(_ catalogue: SearchCatalogue) -> String {
        (legacyFieldText + protocol2FieldText(catalogue)).joined(separator: " ")
    }

    /// Only the values a person would type to find the thing: text, choices
    /// and links. A flag or a number matched by substring finds nothing
    /// anyone was looking for.
    private var legacyFieldText: [String] {
        fields.keys.sorted().compactMap { key -> String? in
            switch fields[key] {
            case .text(let text), .choice(let text), .link(let text): text
            default: nil
            }
        }
    }

    /// The effective protocol-2 values, as the server's `items_fts` indexes
    /// them: stored values and overrides, and a computed field's evaluated
    /// value where it has no override. An unavailable evaluation indexes
    /// nothing, and so does one reporting an override the item no longer
    /// holds.
    private func protocol2FieldText(_ catalogue: SearchCatalogue) -> [String] {
        let overridden = Set(fieldValues.filter { $0.source == .override }.map(\.fieldId))
        var values: [(fieldId: String, value: InventoryPrimitiveValue)] = []
        for entry in fieldValues {
            guard case .value(let entryValues) = entry.state else { continue }
            values += entryValues.map { (entry.fieldId, $0) }
        }
        for computed in computedValues where !overridden.contains(computed.fieldId) {
            guard case .ok(let value) = computed.evaluation else { continue }
            values.append((computed.fieldId, value))
        }
        return values.compactMap { Self.text(of: $0.value, fieldId: $0.fieldId, catalogue) }
    }

    /// The server's `searchableValue`: a scalar as its wire text, an enum as
    /// its option's label, a measurement as amount and unit, and nothing for
    /// a reference.
    private static func text(
        of value: InventoryPrimitiveValue, fieldId: String, _ catalogue: SearchCatalogue
    ) -> String? {
        let text: String? =
            switch value {
            case .string(let string): string
            case .integer(let integer): String(integer.value)
            case .decimal(let decimal): decimal.text
            case .boolean(let flag): String(flag)
            case .enumeration(let optionId):
                catalogue.optionLabel(fieldId: fieldId, optionId: optionId)
            case .measurement(let amount, let unit): "\(amount.text) \(unit)"
            case .date(let date): date.text
            case .dateTime(let dateTime): dateTime.text
            case .url(let url): url.text
            case .reference: nil
            }
        return text.flatMap { $0.isEmpty ? nil : $0 }
    }
}

internal enum ReplicaSearchIndex {
    /// Re-indexes each of `itemIds` from the rows every query reads, with the
    /// computed values the item shows now. An id with no row is skipped.
    static func reindex(_ itemIds: Set<String>, catalogue: SearchCatalogue, in db: Database)
        throws
    {
        for id in itemIds.sorted() {
            guard let item = try ReplicaQueries.storedItem(id: id, in: db) else { continue }
            try index(SearchDocument(item), catalogue: catalogue, in: db)
        }
    }

    static func index(_ document: SearchDocument, catalogue: SearchCatalogue, in db: Database)
        throws
    {
        guard
            let rowid = try Int64.fetchOne(
                db, sql: "SELECT rowid FROM item WHERE id = ?", arguments: [document.id])
        else { return }
        try db.execute(sql: "DELETE FROM item_fts WHERE rowid = ?", arguments: [rowid])
        try db.execute(
            sql: """
                INSERT INTO item_fts (rowid, name, code, note, type_label, field_text, external_ids)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
            arguments: [
                rowid, document.name, document.code, document.note,
                document.typeKey.flatMap { catalogue.types?.type(forKey: $0)?.name },
                document.fieldText(catalogue),
                document.externalIds.map { "\($0.kind) \($0.value)" }.joined(separator: " "),
            ])
    }

    /// A type's label is part of what an item is found by, so a catalogue
    /// that renames one re-indexes every row rather than only new ones.
    static func reindexAll(catalogue: SearchCatalogue, in db: Database) throws {
        let rows = try Row.fetchAll(db, sql: "SELECT * FROM item")
        for row in rows {
            try index(SearchDocument(try ItemRow.decode(row, in: db)), catalogue: catalogue, in: db)
        }
    }

    /// Every live item whose searchable text contains `text`, ranked. An
    /// empty or whitespace-only query matches nothing: what an empty search
    /// shows is the screen's decision, and it is never "everything".
    static func search(_ text: String, includeInactive: Bool, in db: Database) throws
        -> [InventoryItem]
    {
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }
        let lifecycle = includeInactive ? "" : "AND item.lifecycle = 'active'"
        let rows = try Row.fetchAll(
            db,
            sql: """
                SELECT item.* FROM item_fts JOIN item ON item.rowid = item_fts.rowid
                WHERE \(matchClause(for: query)) AND item.deleted_at IS NULL \(lifecycle)
                ORDER BY item.name COLLATE NOCASE, item.id
                """,
            arguments: matchArguments(for: query))
        return InventorySearchRanking.rank(
            try rows.map { try ItemRow.decode($0, in: db) }, query: query)
    }

    private static let searchableColumns = [
        "name", "code", "note", "type_label", "field_text", "external_ids",
    ]

    /// A trigram index answers a phrase of three characters or more from the
    /// index. Anything shorter has no trigram to look up and matches nothing
    /// through `MATCH`, so it falls back to `LIKE` over the same columns.
    private static func usesIndex(_ query: String) -> Bool { query.unicodeScalars.count >= 3 }

    private static func matchClause(for query: String) -> String {
        guard !usesIndex(query) else { return "item_fts MATCH ?" }
        let likes = searchableColumns.map { "item_fts.\($0) LIKE ? ESCAPE '\\'" }
        return "(\(likes.joined(separator: " OR ")))"
    }

    private static func matchArguments(for query: String) -> StatementArguments {
        guard !usesIndex(query) else {
            return ["\"" + query.replacingOccurrences(of: "\"", with: "\"\"") + "\""]
        }
        let escaped = ["\\", "%", "_"].reduce(query) {
            $0.replacingOccurrences(of: $1, with: "\\" + $1)
        }
        return StatementArguments(Array(repeating: "%\(escaped)%", count: searchableColumns.count))
    }
}

/// The approved ranking, carried over unchanged from the design playground's
/// `InventorySearchRanking`: a name that starts with the query, then a name
/// that contains it, then a match on any other field. Ties keep the order the
/// matches arrived in, which here is by name.
internal enum InventorySearchRanking {
    static func rank(_ items: [InventoryItem], query: String) -> [InventoryItem] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return items.enumerated()
            .sorted { lhs, rhs in
                let left = tier(lhs.element.name, trimmed)
                let right = tier(rhs.element.name, trimmed)
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)
    }

    private static func tier(_ name: String, _ query: String) -> Int {
        guard !query.isEmpty else { return 2 }
        if name.range(of: query, options: [.caseInsensitive, .anchored]) != nil { return 0 }
        return name.localizedCaseInsensitiveContains(query) ? 1 : 2
    }
}
