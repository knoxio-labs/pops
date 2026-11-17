import AppCore
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Compact canonical Plan")
@MainActor
internal struct TripsPlanSummaryTests {
    @Test("a visit groups its exact sources behind a disclosure without repeating full cards")
    internal func visitSummary() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let all = allTripSources(snapshot)
        let visit = try #require(
            snapshot.visits.first { visit in all.contains { $0.visitID == visit.id } })
        let sources = all.filter { $0.visitID == visit.id }
        let row = TripsPlanVisitRow(
            visit: visit, place: "Recorded place", sources: sources, places: snapshot.places,
            openSource: { _ in })
        let inspected = try row.inspect()
        #expect(inspected.findAll(ViewType.DisclosureGroup.self).count == 1)
        #expect(inspected.findAll(TripsSourceCard.self).isEmpty)
        #expect(try inspected.find(text: "Recorded place").string() == "Recorded place")
        let rows = try inspected.findAll(TripsPlanLineSourceRow.self).map {
            try $0.actualView().source
        }
        #expect(rows == sources)
    }

    @Test("an empty visit has no disclosure or invented booking state")
    internal func emptyVisit() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let visit = try #require(snapshot.visits.first)
        let row = TripsPlanVisitRow(
            visit: visit, place: "Recorded place", sources: [], places: snapshot.places,
            openSource: { _ in })
        let inspected = try row.inspect()
        #expect(inspected.findAll(ViewType.DisclosureGroup.self).isEmpty)
        #expect(inspected.findAll(ViewType.Button.self).isEmpty)
        #expect(inspected.findAll(TripsSourceCard.self).isEmpty)
    }

    @Test("a compact source opens the unchanged canonical detail")
    internal func sourceAction() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let source = try #require(allTripSources(snapshot).first)
        var selected: TripSource?
        let row = TripsPlanLineSourceRow(source: source, places: snapshot.places) {
            selected = $0
        }
        let inspected = try row.inspect()
        #expect(inspected.findAll(TripsSourceCard.self).isEmpty)
        #expect(
            try inspected.find(text: source.displayName(places: snapshot.places)).string()
                == source.displayName(places: snapshot.places))
        try inspected.find(ViewType.Button.self).tap()
        #expect(selected == source)
    }
}
