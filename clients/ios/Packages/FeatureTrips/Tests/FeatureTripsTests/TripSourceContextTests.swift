import AppCore
import Testing

@testable import FeatureTrips

@Suite("Trip source and timeline context")
internal struct TripSourceContextTests {
    @Test(
        "the approved home title fallback formats source whitespace without storing a derived name")
    internal func tripIdentity() {
        let source = TripRecord(
            id: 99, name: " Source title ", destination: " Elsewhere ", when: "When source",
            tagId: nil, parentId: nil, notes: "", sourceLinks: [])
        #expect(tripName(source) == "Source title")
        #expect(source.name == " Source title ")
        let unnamed = TripRecord(
            id: 99, name: nil, destination: " Place source ", when: "", tagId: nil,
            parentId: nil, notes: "", sourceLinks: [])
        #expect(tripName(unnamed) == "Place source")
        #expect(unnamed.name == nil)
    }

    @Test("source collections retain a purchased alternative while the active timeline excludes it")
    internal func independentSourceCollections() throws {
        let snapshot = try TripTestSources.snapshot()
        let originals = allTripSources(snapshot)
        let purchased = try #require(originals.first { $0.id == "journey-2" })
        #expect(purchased.isAlternative(in: snapshot))
        #expect(tripSourceMatches(purchased, query: "Purchased", places: snapshot.places))
        #expect(!tripSources(snapshot).contains { $0.id == purchased.id })
        #expect(originals.count == snapshot.stays.count + snapshot.journeys.count)
        let selected = try #require(originals.first { $0.id == "journey-1" })
        #expect(!selected.isAlternative(in: snapshot))
    }

    @Test("a future checkout cannot establish a now-or-next phase when check-in is unknown")
    internal func futureEndWithoutStart() throws {
        let source = TripSource.stay(
            TripStay(
                id: 1, tripId: 1, visitId: nil, name: "Unknown check-in", kind: nil,
                status: "Reserved",
                timing: TripStayTiming(
                    arrival: nil, departure: "2026-01-05", checkIn: nil, checkOut: "11:00",
                    timeZone: "UTC"),
                address: nil, reference: nil, notes: "", sourceLinks: [], hostLinks: [],
                documentLinks: []))
        let now = try #require(TripClock.instant(local: "2026-01-02T12:00", zone: "UTC"))
        #expect(source.end != nil)
        #expect(!TripBookingScope.currentAndFuture.includes(source, at: now))
        #expect(TripBookingScope.all.includes(source, at: now))
    }

    @Test("missing explicit references remain findings without discarding original records")
    internal func missingReferences() throws {
        let original = try TripTestSources.snapshot()
        let snapshot = TripSnapshot(
            trip: original.trip, places: [], visits: original.visits, journeys: [],
            journeyGroups: original.journeyGroups, stays: original.stays, events: original.events,
            documentAssociations: original.documentAssociations)
        let findings = tripReferenceFindings(snapshot)
        #expect(findings.map(\.id) == ["visit-4", "group-1-1", "group-1-2"])
        #expect(snapshot.stays == original.stays)
        #expect(snapshot.journeyGroups == original.journeyGroups)
        #expect(allTripSources(snapshot).count == original.stays.count)
    }
}
