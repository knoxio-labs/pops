import Foundation
import Testing

@testable import AppCore

@Suite("Universal search vocabulary")
internal struct SearchVocabularyTests {
    @Test("All asks only the available pillars in their supplied order")
    func availablePillars() {
        #expect(SearchScope.all.pillars(in: [.inventory]) == [.inventory])
        #expect(
            SearchScope.all.pillars(in: [.inventory, .purchases]) == [.inventory, .purchases])
        #expect(SearchScope.pillar(.purchases).pillars(in: [.inventory]).isEmpty)
    }

    @Test("a scoped recent appears in All and its own pillar only")
    func recentVisibility() {
        let inventory = SearchRecent(query: "office 04", scope: .pillar(.inventory))
        let purchases = SearchRecent(query: "total tools", scope: .pillar(.purchases))
        let all = SearchRecent(query: "screws")

        #expect(inventory.shows(in: .all))
        #expect(inventory.shows(in: .pillar(.inventory)))
        #expect(!inventory.shows(in: .pillar(.purchases)))
        #expect(purchases.shows(in: .pillar(.purchases)))
        #expect(!purchases.shows(in: .pillar(.inventory)))
        #expect(all.shows(in: .pillar(.inventory)))
        #expect(all.shows(in: .pillar(.purchases)))
    }

    @Test("recents round-trip with both scope shapes")
    func recentCoding() throws {
        let recents = [
            SearchRecent(query: "screws"),
            SearchRecent(query: "office 04", scope: .pillar(.inventory)),
        ]

        let decoded = try JSONDecoder().decode(
            [SearchRecent].self, from: JSONEncoder().encode(recents))

        #expect(decoded == recents)
    }

    @Test("pillars map to the matching mobile feature identifiers")
    func featureMapping() {
        #expect(SearchPillar.inventory.feature.rawValue == "inventory")
        #expect(SearchPillar.purchases.feature.rawValue == "purchases")
    }
}
