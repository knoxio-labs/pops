import AppCore
import InventoryReplica
import Testing

@Suite("Search")
internal struct ReplicaSearchTests {
    private static func item(
        _ id: String, name: String, typeKey: String? = nil, note: String? = nil,
        code: String? = nil,
        lifecycle: InventoryLifecycle = .active
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: name, typeKey: typeKey, note: note, code: code,
            lifecycle: lifecycle, placement: .hand, createdAt: Fixture.created,
            updatedAt: Fixture.created)
    }

    @Test("a name prefix ranks before a name that contains, before any other field")
    func rankingTiers() throws {
        let replica = try Fixture.downloaded(items: [
            Self.item("note", name: "Adapter", note: "spare drill bits"),
            Self.item("contains", name: "Cordless drill"),
            Self.item("prefix", name: "Drill press"),
            Self.item("miss", name: "Hammer"),
        ])

        #expect(try replica.ids(.search("drill")) == ["prefix", "contains", "note"])
    }

    @Test("ties within a tier keep name order")
    func tiesKeepNameOrder() throws {
        let replica = try Fixture.downloaded(items: [
            Self.item("b", name: "box two"), Self.item("a", name: "Box one"),
            Self.item("c", name: "big box"),
        ])

        #expect(try replica.ids(.search("box")) == ["a", "b", "c"])
    }

    @Test("a match inside a word is found, not only at a word start")
    func substringMatch() throws {
        let replica = try Fixture.downloaded(items: [Self.item("h", name: "Sledgehammer")])

        #expect(try replica.ids(.search("HAMMER")) == ["h"])
        #expect(try replica.ids(.search("dgeh")) == ["h"])
    }

    @Test("a query shorter than a trigram still matches, case-insensitively")
    func shortQuery() throws {
        let replica = try Fixture.downloaded(items: [
            Self.item("tv", name: "TV stand"), Self.item("code", name: "Crate", code: "B12"),
            Self.item("miss", name: "Lamp"),
        ])

        #expect(try replica.ids(.search("tv")) == ["tv"])
        #expect(try replica.ids(.search("b1")) == ["code"])
    }

    @Test("LIKE wildcards in a short query are literal")
    func shortQueryEscapesWildcards() throws {
        let replica = try Fixture.downloaded(items: [
            Self.item("pct", name: "50% off"), Self.item("other", name: "Lamp"),
        ])

        #expect(try replica.ids(.search("%")) == ["pct"])
        #expect(try replica.read(.search("_")).isEmpty)
    }

    @Test("a quote in a long query is part of the phrase, not syntax")
    func quoteInPhrase() throws {
        let replica = try Fixture.downloaded(items: [Self.item("q", name: #"12" ruler"#)])

        #expect(try replica.ids(.search(#"12" r"#)) == ["q"])
        #expect(try replica.read(.search(#"13" r"#)).isEmpty)
    }

    @Test("an empty or blank query matches nothing")
    func emptyQuery() throws {
        let replica = try Fixture.downloaded(items: [Self.item("a", name: "Anything")])

        #expect(try replica.read(.search("")).isEmpty)
        #expect(try replica.read(.search("   ")).isEmpty)
    }

    @Test("inactive items are found only when asked for")
    func inactiveOnlyOnRequest() throws {
        let replica = try Fixture.downloaded(items: [
            Self.item("gone", name: "Old kettle", lifecycle: .discarded),
            Self.item("here", name: "New kettle"),
        ])

        #expect(try replica.ids(.search("kettle")) == ["here"])
        #expect(try replica.ids(.search("kettle", includeInactive: true)) == ["here", "gone"])
    }

    @Test("code, note, text fields and external identifiers are searchable; flags are not")
    func otherFields() throws {
        let item = InventoryItem(
            id: "tv", revision: 1, seq: 1, name: "Television", typeKey: nil,
            fields: ["brand": .text("Sony"), "smart": .flag(true)], code: "B412",
            externalIds: [InventoryExternalIdentifier(kind: "serial", value: "SN-99812")],
            placement: .hand, createdAt: Fixture.created, updatedAt: Fixture.created)
        let replica = try Fixture.downloaded(items: [item])

        #expect(try replica.ids(.search("sony")) == ["tv"])
        #expect(try replica.ids(.search("b412")) == ["tv"])
        #expect(try replica.ids(.search("99812")) == ["tv"])
        #expect(try replica.read(.search("true")).isEmpty)
    }

    @Test("a type's label is searchable, and renaming the type re-indexes stored items")
    func typeLabelFollowsCatalogue() throws {
        let replica = try Fixture.downloaded(items: [
            Self.item("k", name: "Blue one", typeKey: "kettle")
        ])
        #expect(try replica.read(.search("kettle")).isEmpty)

        try replica.store(catalogue(version: "v1", kettleName: "Kettle"))
        #expect(try replica.ids(.search("kettle")) == ["k"])

        try replica.store(catalogue(version: "v2", kettleName: "Jug"))
        #expect(try replica.read(.search("kettle")).isEmpty)
        #expect(try replica.ids(.search("jug")) == ["k"])
    }

    private func catalogue(version: String, kettleName: String) -> InventoryCatalogue {
        InventoryCatalogue(
            version: version, units: [],
            types: [InventoryType(key: "kettle", name: kettleName, capabilities: [], fields: [])])
    }
}
