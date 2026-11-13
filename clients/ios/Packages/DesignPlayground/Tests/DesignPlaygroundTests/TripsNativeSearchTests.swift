import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Native Trips search ownership")
@MainActor
internal struct TripsNativeSearchTests {
    @Test(
        "cancelling search returns to its originating destination",
        arguments: [TripsTab.trips, .plan, .inbox])
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
}
