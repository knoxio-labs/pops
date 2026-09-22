import AppCore
import Foundation
import Testing

@testable import FeatureSearch

@Suite("Search recents store")
internal struct SearchRecentsStoreTests {
    @Test("same-scope duplicate moves to the front without changing its spelling")
    internal func sameScopeDedupe() {
        let initial = [
            SearchRecent(query: "bolts", scope: .pillar(.inventory)),
            SearchRecent(query: "Office 04", scope: .pillar(.inventory)),
            SearchRecent(query: "receipts", scope: .pillar(.purchases)),
        ]

        let added = SearchRecentsStore.adding(
            "office 04", scope: .pillar(.inventory), to: initial)

        #expect(added.map(\.query) == ["office 04", "bolts", "receipts"])
    }

    @Test("the same query remains distinct across scopes")
    internal func differentScopesRemain() {
        let initial = [SearchRecent(query: "bolts", scope: .pillar(.inventory))]

        let added = SearchRecentsStore.adding(
            "BOLTS", scope: .pillar(.purchases), to: initial)

        #expect(added.count == 2)
        #expect(added.map(\.scope) == [.pillar(.purchases), .pillar(.inventory)])
    }

    @Test("a seventh recent drops the oldest")
    internal func limit() {
        let initial = (1...6).map { SearchRecent(query: "query \($0)") }

        let added = SearchRecentsStore.adding("new", scope: .all, to: initial)

        #expect(
            added.map(\.query) == ["new", "query 1", "query 2", "query 3", "query 4", "query 5"])
    }

    @Test("a blank query changes nothing")
    internal func blank() {
        let initial = [SearchRecent(query: "bolts")]
        #expect(SearchRecentsStore.adding("  \n", scope: .all, to: initial) == initial)
    }

    @Test("migration stores inventory recents once")
    internal func migrationOnce() throws {
        let defaults = try #require(
            UserDefaults(suiteName: "SearchRecentsStoreTests.once.\(UUID())"))
        let store = SearchRecentsStore(defaults: defaults)

        let migrated = store.migrating(inventoryQueries: ["office", "garage"])
        let repeated = store.migrating(inventoryQueries: ["replacement"])

        #expect(migrated.map(\.query) == ["office", "garage"])
        #expect(migrated.allSatisfy { $0.scope == .pillar(.inventory) })
        #expect(repeated == migrated)
        #expect(store.load() == migrated)
    }

    @Test("an empty legacy value does not create new storage")
    internal func emptyMigration() throws {
        let defaults = try #require(
            UserDefaults(suiteName: "SearchRecentsStoreTests.empty.\(UUID())"))
        let store = SearchRecentsStore(defaults: defaults)

        #expect(store.migrating(inventoryQueries: []) == [])
        #expect(defaults.object(forKey: SearchRecentsStore.key) == nil)
    }

    @Test("corrupt current storage decodes as empty and prevents migration")
    internal func corruptValue() throws {
        let defaults = try #require(
            UserDefaults(suiteName: "SearchRecentsStoreTests.corrupt.\(UUID())"))
        defaults.set(Data("not json".utf8), forKey: SearchRecentsStore.key)
        let store = SearchRecentsStore(defaults: defaults)

        #expect(store.load() == [])
        #expect(store.migrating(inventoryQueries: ["legacy"]) == [])
    }
}
