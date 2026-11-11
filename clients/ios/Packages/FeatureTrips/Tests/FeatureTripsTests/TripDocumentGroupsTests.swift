import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Explicit document associations")
internal struct TripDocumentGroupsTests {
    @Test(
        "trip documents lead ordered visits, while journeys remain separate and missing targets remain visible"
    )
    internal func exactGroups() throws {
        let original = try TripTestSources.snapshot()
        let current = try #require(original.journeys.first)
        let journey = TripJourney(
            id: current.id, tripId: current.tripId, name: "Recife", reference: current.reference,
            notes: current.notes, sourceLinks: current.sourceLinks, buffers: current.buffers,
            legs: current.legs)
        let visit = TripVisit(
            id: 9, tripId: 1, placeId: 1,
            timing: TripVisitTiming(arrival: nil, departure: nil, month: nil, duration: nil),
            notes: "", sourceLinks: [])
        let links = [
            association(1, document: 10, kind: "trip", target: 1),
            association(2, document: 10, kind: "stay", target: 1),
            association(3, document: 11, kind: "visit", target: 4),
            association(4, document: 12, kind: "visit", target: 9),
            association(5, document: 13, kind: "journey", target: 1),
            association(6, document: 14, kind: "stay", target: 404),
            association(7, document: 11, kind: "stay", target: 1),
            association(8, document: 15, kind: "journey", target: 2),
        ]
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: original.visits + [visit],
            journeys: [journey] + original.journeys.filter { $0.id != current.id },
            journeyGroups: original.journeyGroups, stays: original.stays, events: [],
            documentAssociations: links)
        let groups = tripDocumentGroups(snapshot)
        #expect(
            groups.map(\.id) == ["trip", "visit-4", "visit-9", "journey-1", "journey-2", "other"])
        #expect(groups.map(\.documentIDs) == [[10], [10, 11], [12], [13], [15], [14]])
        #expect(Set(groups.flatMap(\.associations).map(\.id)) == Set(links.map(\.id)))
        #expect(
            groups.first { $0.id == "visit-4" }?.name != groups.first { $0.id == "visit-9" }?.name)
        let missing = try #require(links.first { $0.id == 6 })
        #expect(tripDocumentSource(missing, snapshot: snapshot) == nil)
        #expect(tripDocumentTarget(missing, snapshot: snapshot) == "stay 404 unavailable")
        #expect(snapshot.documentAssociations == links)
    }

    @Test("an empty explicit association collection never imports opaque document reference URIs")
    internal func noInferredAssociations() throws {
        let original = try TripTestSources.snapshot()
        let known = try #require(original.stays.first)
        let reference = TripSourceLink(uri: "pops:documents/document/99", label: "Source reference")
        let stay = TripStay(
            id: known.id, tripId: known.tripId, visitId: known.visitId, name: known.name,
            kind: known.kind, status: known.status, timing: known.timing, address: known.address,
            reference: known.reference, notes: known.notes, sourceLinks: known.sourceLinks,
            hostLinks: known.hostLinks, documentLinks: [reference])
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: original.visits,
            journeys: original.journeys, journeyGroups: original.journeyGroups, stays: [stay],
            events: [], documentAssociations: [])
        #expect(snapshot.stays.first?.documentLinks == [reference])
        #expect(tripDocumentGroups(snapshot).isEmpty)
    }

    private func association(
        _ id: Int, document: Int, kind: String, target: Int
    ) -> TripDocumentAssociation {
        TripDocumentAssociation(
            id: id, tripId: 1, documentId: document, targetKind: kind, targetId: target,
            createdAt: Date(timeIntervalSince1970: 0))
    }
}
