import Testing

@testable import DesignPlayground

@Suite("Universal search")
@MainActor
internal struct UniversalSearchModelTests {
    private struct Shown {
        let rows: Int
        let total: Int
        let query: String
        let refining: Bool
    }

    private func results(_ section: SearchSection?) -> Shown? {
        guard case .results(let rows, let total, let query, let refining) = section?.content else {
            return nil
        }
        return Shown(rows: rows.count, total: total, query: query, refining: refining)
    }

    private func section(_ model: UniversalSearchModel, _ pillar: SearchPillar) -> SearchSection? {
        model.sections.first { $0.pillar == pillar }
    }

    @Test("All caps each pillar at three rows and keeps the total; one pillar shows every row")
    func capping() throws {
        let all = UniversalSearchModel(query: "tool")
        let inventory = try #require(results(section(all, .inventory)))
        try #require(inventory.total > UniversalSearchModel.allCap)
        #expect(inventory.rows == UniversalSearchModel.allCap)

        let scoped = UniversalSearchModel(query: "tool", scope: .pillar(.inventory))
        let whole = try #require(results(section(scoped, .inventory)))
        #expect(whole.rows == inventory.total)
        #expect(scoped.sections.map(\.pillar) == [.inventory])
    }

    @Test("sections follow tab-bar order, and a pillar with nothing leaves no section")
    func orderAndOmission() {
        let both = UniversalSearchModel(query: "tool")
        #expect(both.sections.map(\.pillar) == [.purchases, .inventory])

        let inventoryOnly = UniversalSearchModel(query: "gar")
        #expect(inventoryOnly.sections.map(\.pillar) == [.inventory])
    }

    @Test("a first request draws skeletons; a later one keeps the earlier rows, marked refining")
    func pending() throws {
        let first = UniversalSearchModel(
            query: "screw", answers: [.purchases: .pending(previous: nil)])
        #expect(section(first, .purchases)?.content == .loading)

        let refining = UniversalSearchModel(
            query: "screw", answers: [.purchases: .pending(previous: "sc")])
        let earlier = try #require(results(section(refining, .purchases)))
        #expect(earlier.query == "sc")
        #expect(earlier.refining)
        #expect(results(section(refining, .inventory))?.refining == false)
    }

    @Test("an earlier query that found nothing still draws skeletons, not an empty section")
    func pendingAfterNothing() {
        let model = UniversalSearchModel(
            query: "screw", answers: [.purchases: .pending(previous: "xylophone")])
        #expect(section(model, .purchases)?.content == .loading)
    }

    @Test("offline and failed pillars keep a section, so the answer says it is partial")
    func partialAnswers() {
        let offline = UniversalSearchModel(query: "xylophone", answers: [.purchases: .offline])
        #expect(offline.sections.map(\.content) == [.offline])
        #expect(!offline.hasNoResults)

        let failed = UniversalSearchModel(query: "gar", answers: [.purchases: .failed])
        #expect(section(failed, .purchases)?.content == .failed)
    }

    @Test("no results only when every pillar in scope answered and found nothing")
    func noResults() {
        #expect(UniversalSearchModel(query: "xylophone").hasNoResults)
        #expect(!UniversalSearchModel(query: "").hasNoResults)
        #expect(UniversalSearchModel(query: "").sections.isEmpty)
    }

    @Test("chips count only once something is typed, and say offline before it is")
    func chips() throws {
        let typed = UniversalSearchModel(query: "tool")
        let total = try #require(results(section(typed, .inventory))?.total)
        #expect(typed.chipStatus(for: .inventory) == .count(total))

        let empty = UniversalSearchModel(query: "", answers: [.purchases: .offline])
        #expect(empty.chipStatus(for: .inventory) == .none)
        #expect(empty.chipStatus(for: .purchases) == .offline)

        let asking = UniversalSearchModel(
            query: "tool", answers: [.purchases: .pending(previous: nil)])
        #expect(asking.chipStatus(for: .purchases) == .pending)
    }

    @Test("a filter counts as on only for a pillar in scope")
    func filteredByScope() {
        let filter = InventorySearchFilter(placement: .contained)
        #expect(UniversalSearchModel(query: "a", inventoryFilter: filter).isFiltered)
        #expect(
            !UniversalSearchModel(
                query: "a", scope: .pillar(.purchases), inventoryFilter: filter
            ).isFiltered)
    }

    @Test("recents searched in one pillar show in All and that pillar only")
    func recentsScope() {
        let inventoryOnly = SearchRecent(query: "office 04", scope: .pillar(.inventory))
        let everywhere = SearchRecent(query: "screws")
        #expect(inventoryOnly.shows(in: .all))
        #expect(inventoryOnly.shows(in: .pillar(.inventory)))
        #expect(!inventoryOnly.shows(in: .pillar(.purchases)))
        #expect(everywhere.shows(in: .pillar(.purchases)))
    }
}
