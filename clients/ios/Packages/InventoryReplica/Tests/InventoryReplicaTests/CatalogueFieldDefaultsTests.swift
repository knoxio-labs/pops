import AppCore
import GRDB
import Testing

@testable import InventoryReplica

/// Field default values on stored catalogue revisions (POPS-4846): kept as
/// the server sent them and read back by the field's kind, `[]` for every
/// row an older replica stored, filled in once for a revision stored before
/// defaults existed, and otherwise as immutable as the rest of the revision.
@Suite("Catalogue field defaults")
internal struct CatalogueFieldDefaultsTests {
    private typealias Fixture = RebaseFixture

    private static let tags = "11111111-1111-4111-8111-111111111111"
    private static let ratio = "22222222-2222-4222-8222-222222222222"
    private static let bought = "33333333-3333-4333-8333-333333333333"
    private static let count = "44444444-4444-4444-8444-444444444444"
    private static let dimmable = "55555555-5555-4555-8555-555555555555"
    private static let manual = "66666666-6666-4666-8666-666666666666"

    private static func field(
        _ id: String, key: String, kind: InventoryPrimitiveKind, sortOrder: Int,
        cardinality: InventoryFieldCardinality = .one, fixedUnit: String? = nil,
        options: [InventoryCatalogueOption] = [], defaults: [InventoryPrimitiveValue]
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: Fixture.typeId, key: key, label: key, sortOrder: sortOrder,
            kind: kind, cardinality: cardinality, required: false, storage: .stored,
            fixedUnit: fixedUnit, defaultValues: defaults, enumOptions: options)
    }

    private static func catalogue(withDefaults: Bool) throws -> InventoryCatalogueSnapshot {
        func defaults(_ values: [InventoryPrimitiveValue]) -> [InventoryPrimitiveValue] {
            withDefaults ? values : []
        }
        return Fixture.catalogue(
            2,
            [
                field(
                    Fixture.lumens, key: "lumens", kind: .measurement, sortOrder: 0,
                    fixedUnit: "lm",
                    defaults: defaults([
                        .measurement(amount: try InventoryDecimal("800"), unit: "lm")
                    ])),
                field(
                    Fixture.colour, key: "colour", kind: .enumeration, sortOrder: 1,
                    options: [Fixture.option()],
                    defaults: defaults([.enumeration(optionId: Fixture.warm)])),
                field(
                    tags, key: "tags", kind: .shortText, sortOrder: 2, cardinality: .many,
                    defaults: defaults([.string("warm"), .string("dimmable")])),
                field(
                    ratio, key: "ratio", kind: .decimal, sortOrder: 3,
                    defaults: defaults([.decimal(try InventoryDecimal("1.25"))])),
                field(
                    bought, key: "bought", kind: .date, sortOrder: 4,
                    defaults: defaults([.date(try InventoryCanonicalDate("2026-09-01"))])),
                field(
                    count, key: "count", kind: .integer, sortOrder: 5,
                    defaults: defaults([.integer(try InventoryInteger(4))])),
                field(
                    dimmable, key: "dimmable", kind: .boolean, sortOrder: 6,
                    defaults: defaults([.boolean(true)])),
                field(
                    manual, key: "manual", kind: .url, sortOrder: 7,
                    defaults: defaults([.url(try InventoryCanonicalURL("https://example.com/m"))])),
            ])
    }

    private static func defaults(in replica: InventoryReplica) throws
        -> [String: [InventoryPrimitiveValue]]
    {
        let fields = try #require(try replica.catalogue(revision: 2)?.types.first).fields
        return Dictionary(uniqueKeysWithValues: fields.map { ($0.id, $0.defaultValues) })
    }

    @Test("a stored revision reads back every default the server sent, by kind")
    func roundTrip() throws {
        let replica = try InventoryReplica()
        let catalogue = try Self.catalogue(withDefaults: true)

        try replica.store(catalogue)

        #expect(try replica.catalogue(revision: 2) == catalogue.inStoredOrder)
        #expect(
            try Self.defaults(in: replica)[Self.tags] == [.string("warm"), .string("dimmable")])
    }

    @Test("a revision stored without defaults takes them once when fetched again")
    func fillsMissingDefaults() throws {
        let replica = try InventoryReplica()
        try replica.store(try Self.catalogue(withDefaults: false))
        #expect(try Self.defaults(in: replica).values.allSatisfy(\.isEmpty))

        try replica.store(try Self.catalogue(withDefaults: true))

        #expect(
            try replica.catalogue(revision: 2)
                == (try Self.catalogue(withDefaults: true)).inStoredOrder)
    }

    @Test("recorded defaults never change")
    func defaultsAreImmutable() throws {
        let replica = try InventoryReplica()
        try replica.store(try Self.catalogue(withDefaults: true))

        #expect(throws: InventoryReplicaError.self) {
            try replica.store(try Self.catalogue(withDefaults: false))
        }
        #expect(throws: DatabaseError.self) {
            try replica.database.write { db in
                try db.execute(sql: "UPDATE catalogue_field SET default_values = '[]'")
            }
        }
        #expect(
            try replica.catalogue(revision: 2)
                == (try Self.catalogue(withDefaults: true)).inStoredOrder)
    }

    @Test("the column refuses anything but a JSON array")
    func columnRefusesNonArray() throws {
        let replica = try InventoryReplica()
        try replica.store(try Self.catalogue(withDefaults: false))

        #expect(throws: DatabaseError.self) {
            try replica.database.write { db in
                try db.execute(sql: #"UPDATE catalogue_field SET default_values = '"x"'"#)
            }
        }
    }

    @Test("an existing replica's stored fields read as having no defaults after the upgrade")
    func migratesExistingReplica() throws {
        let queue = try DatabaseQueue()
        let migrator = ReplicaSchema.migrator()
        try migrator.migrate(queue, upTo: "v13_catalogue_lineage")
        try queue.write { db in
            #expect(try !db.columns(in: "catalogue_field").contains { $0.name == "default_values" })
            let presentation = try StoredJSON.encode(InventoryJSON.object([:]))
            try db.execute(
                sql: """
                    INSERT INTO catalogue_revision (revision, base_revision, status, minimum_protocol)
                    VALUES (2, NULL, 'published', 2)
                    """)
            try db.execute(
                sql: """
                    INSERT INTO catalogue_type
                        (revision, id, key, label, description, sort_order, capabilities,
                         legacy_labels, presentation, archived_at)
                    VALUES (2, ?, 'bulb', 'Bulb', NULL, 0, '[]', '[]', ?, NULL)
                    """, arguments: [Fixture.typeId, presentation])
            try db.execute(
                sql: """
                    INSERT INTO catalogue_field
                        (revision, id, type_id, key, label, help, sort_order, kind, cardinality,
                         required, storage, fixed_unit, reference_kinds, reference_type_ids,
                         expression_version, expression, allow_override, presentation, archived_at)
                    VALUES (2, ?, ?, 'tags', 'tags', NULL, 0, 'short_text', 'many', 0, 'stored',
                        NULL, '[]', '[]', NULL, NULL, 0, ?, NULL)
                    """, arguments: [Self.tags, Fixture.typeId, presentation])
        }

        try migrator.migrate(queue)

        try queue.read { db in
            let text = try String.fetchOne(db, sql: "SELECT default_values FROM catalogue_field")
            #expect(text == "[]")
            let stored = try #require(try Protocol2CatalogueRows.read(revision: 2, in: db))
            let field = try #require(stored.types.first?.fields.first)
            #expect(field.id == Self.tags)
            #expect(field.defaultValues.isEmpty)
        }
    }
}
