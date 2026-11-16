import Testing

@testable import FeatureTrips

@Suite("Timeline empty state")
internal struct TripTimelineEmptyStateTests {
    @Test("an empty unfiltered trip invites its first record")
    internal func emptyTrip() {
        var filter = TripTimelineFilter()
        filter.grouping = .month
        filter.query = "   "

        #expect(
            tripTimelineEmptyState(filter: filter, sources: [], visits: []) == .nothingRecorded)
    }

    @Test("an active filter explains that there are no matches")
    internal func emptyFilteredResults() {
        var filter = TripTimelineFilter()
        filter.query = "unrecorded reference"

        #expect(tripTimelineEmptyState(filter: filter, sources: [], visits: []) == .noMatches)

        filter.query = ""
        filter.scope = .past
        filter.includeAlternatives = false
        filter.fromDay = "2026-01-01"
        filter.throughDay = "2026-02-01"
        #expect(tripTimelineEmptyState(filter: filter, sources: [], visits: []) == .noMatches)

        filter.clearSelection()
        #expect(!filter.hasActiveSelection)
        #expect(filter.query.isEmpty)
        #expect(filter.scope == .all)
        #expect(filter.includeAlternatives)
        #expect(filter.fromDay == nil)
        #expect(filter.throughDay == nil)
    }

    @Test("visible sources or visits suppress an empty state")
    internal func populatedResults() throws {
        let snapshot = try TripTestSources.snapshot()
        var filter = TripTimelineFilter()
        filter.query = "unrecorded reference"

        #expect(
            tripTimelineEmptyState(
                filter: filter, sources: allTripSources(snapshot), visits: []) == nil)
        #expect(
            tripTimelineEmptyState(filter: filter, sources: [], visits: snapshot.visits) == nil)
    }
}
