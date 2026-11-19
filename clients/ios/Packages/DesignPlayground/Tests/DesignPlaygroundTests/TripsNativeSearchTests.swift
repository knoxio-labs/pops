import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Native Trips search ownership")
@MainActor
internal struct TripsNativeSearchTests {
    @Test(
        "cancelling search returns to its originating destination",
        arguments: [TripsTab.today, .plan, .inbox])
    internal func cancelSearch(origin: TripsTab) async throws {
        let context = try await TripNavigationTestContext.make()
        context.model.tab = origin
        context.model.tab = .search
        context.model.searchQuery = "harbour"
        let search = try context.root.inspect().find(TripsSearchView.self).actualView()
        search.dismissSearch()
        #expect(context.model.tab == origin)
        context.model.tab = .inbox
        search.dismissSearch()
        #expect(context.model.tab == .inbox)
    }

    @Test("the native search field and results share a query across tab changes")
    internal func sharedQuery() async throws {
        let context = try await TripNavigationTestContext.make()
        context.model.tab = .search
        context.model.searchQuery = "harbour"
        let first = try context.root.inspect().find(TripsSearchResults.self).actualView()
        #expect(first.query == "harbour")
        context.model.tab = .plan
        context.model.tab = .search
        let returned = try context.root.inspect().find(TripsSearchResults.self).actualView()
        #expect(returned.query == "harbour")
        context.model.searchQuery = ""
        #expect(try context.root.inspect().find(TripsSearchResults.self).actualView().query.isEmpty)
    }

    @Test("the selected search scope filters sources and stays selected as the query changes")
    internal func filterScopePersistsAcrossQueryChanges() async throws {
        let context = try await TripNavigationTestContext.make()
        context.model.tab = .search
        context.model.searchQuery = "flight"
        let results = try context.root.inspect().find(TripsSearchResults.self)
        let buttons = results.findAll(ViewType.Button.self)
        #expect(buttons.count >= TripsSearchFilter.allCases.count)
        let flightButton = try #require(
            buttons.first { button in
                (try? button.labelView().findAll(ViewType.Text.self).compactMap {
                    try? $0.string()
                }.contains("Flights")) == true
            })

        try flightButton.tap()
        #expect(context.model.searchFilter == .flights)
        let flightResults = try context.root.inspect().find(TripsSearchResultGroups.self)
            .actualView()
        #expect(!flightResults.sources.isEmpty)
        #expect(flightResults.sources.allSatisfy(isFlightJourney))

        context.model.searchQuery = try #require(
            context.first.stays.first(where: { $0.reference != nil })?.reference)
        let changedQueryResults = try context.root.inspect()
            .find(TripsSearchResultGroups.self).actualView()
        #expect(context.model.searchFilter == .flights)
        #expect(changedQueryResults.sources.isEmpty)
    }
}
