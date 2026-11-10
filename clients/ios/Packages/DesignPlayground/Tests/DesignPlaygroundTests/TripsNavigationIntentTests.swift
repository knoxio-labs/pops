import AppCore
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Root navigation intent")
@MainActor
internal struct TripsNavigationIntentTests {
    internal enum NewerIntent: CaseIterable { case timeline, differentSource, otherTripThenBack }

    @Test(
        "a late source intent cannot change a newer Timeline destination",
        arguments: NewerIntent.allCases, [false, true])
    internal func latestIntent(_ newer: NewerIntent, oldFails: Bool) async throws {
        let context = try await TripNavigationTestContext.make()
        let oldTask = try await context.startSource()
        let expected = try await settle(newer, context: context)
        #expect(context.model.source == expected)
        await context.reader.complete(2, snapshot: context.first, fails: oldFails)
        await oldTask.value
        #expect(context.model.source == expected)
        #expect(context.model.snapshot == context.first)
        #expect(context.model.failure == nil)
        #expect(context.model.tab == .trips)
    }

    @Test(
        "the app-level Search selection binding invalidates pending detail delivery",
        arguments: [false, true])
    internal func manualSearch(oldFails: Bool) async throws {
        let context = try await TripNavigationTestContext.make()
        let task = try await context.startSource()
        context.model.tab = .search
        await context.reader.complete(2, snapshot: context.first, fails: oldFails)
        await task.value
        #expect(context.model.tab == .search)
        #expect(context.model.source == nil)
        #expect(context.model.failure == (oldFails ? .unavailable : nil))
    }

    @Test(
        "a newer read failure is not replaced by an old success or error", arguments: [false, true])
    internal func newerFailure(oldFails: Bool) async throws {
        let context = try await TripNavigationTestContext.make()
        let oldTask = try await context.startSource()
        try context.tap(query: try #require(context.first.trip.name))
        try await context.finish(3, snapshot: context.first, fails: true)
        await context.reader.complete(2, snapshot: context.first, fails: oldFails)
        await oldTask.value
        #expect(context.model.source == nil)
        #expect(context.model.snapshot == nil)
        #expect(context.model.failure == .unavailable)
        #expect(!context.model.loading)
    }

    @Test("refreshing the same Trip invalidates an older source intent")
    internal func refresh() async throws {
        let context = try await TripNavigationTestContext.make()
        let oldTask = try await context.startSource()
        let refresh = Task { await context.model.load() }
        await context.reader.waitFor(3)
        await context.reader.complete(3, snapshot: context.first)
        await refresh.value
        await context.reader.complete(2, snapshot: context.first)
        await oldTask.value
        #expect(context.model.source == nil)
        #expect(context.model.snapshot == context.first)
        #expect(context.model.failure == nil)
    }

    @Test("a root Search result retains its owner Trip after another Trip becomes selected")
    internal func sourceOwner() async throws {
        let context = try await TripNavigationTestContext.make()
        let originalSearch = try context.root.inspect().find(TripsSearchView.self).actualView()
        try context.tap(query: try #require(context.second.trip.name))
        try await context.finish(2, snapshot: context.second)
        let results = TripsSearchResults(
            trips: originalSearch.trips, snapshot: originalSearch.snapshot,
            selectTrip: originalSearch.selectTrip, openSource: originalSearch.openSource,
            query: try #require(context.first.stays.first?.reference))
        try #require(results.inspect().findAll(ViewType.Button.self).first).tap()
        try await context.finish(3, snapshot: context.first)
        #expect(await context.reader.requested.last == context.first.trip.id)
        #expect(context.model.selectedID == context.first.trip.id)
        #expect(context.model.source == .stay(try #require(context.first.stays.first)))
    }

    private func settle(_ newer: NewerIntent, context: TripNavigationTestContext) async throws
        -> TripSource?
    {
        try context.tap(
            query: try #require(
                newer == .otherTripThenBack ? context.second.trip.name : context.first.trip.name))
        try await context.finish(
            3, snapshot: newer == .otherTripThenBack ? context.second : context.first)
        if newer == .otherTripThenBack {
            try context.tap(query: try #require(context.first.trip.name))
            try await context.finish(4, snapshot: context.first)
        } else if newer == .differentSource {
            let value = try #require(context.first.stays.first { $0.id == 2 })
            try context.tap(query: TripSource.stay(value).name)
            try await context.finish(4, snapshot: context.first)
            return .stay(value)
        }
        return nil
    }
}
