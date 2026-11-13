import AppCore
import Foundation
import Testing

@testable import Pops

@MainActor
internal final class TripDocumentOfflineFixture {
    internal let root: URL
    internal let verifiedAt = Date(timeIntervalSince1970: 1_790_000_000)
    internal var current: TripDocumentOfflineOwner

    internal init() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        current = try Self.owner()
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    internal func remove() { try? FileManager.default.removeItem(at: root) }

    internal static func owner(
        origin: String = "https://owner.example", device: String = "phone", revision: UInt64 = 1
    ) throws -> TripDocumentOfflineOwner {
        TripDocumentOfflineOwner(
            device: PairedDevice(
                id: device, baseURL: try #require(URL(string: origin)), credentialRevision: revision
            ))
    }

    internal func store(_ owner: TripDocumentOfflineOwner? = nil) -> ProtectedTripDocumentStore {
        let owner = owner ?? current
        return ProtectedTripDocumentStore(
            owner: owner, root: { self.root }, isCurrent: { self.current == owner })
    }

    internal func download(_ text: String, responseSize: Int? = nil) throws -> DownloadedDocument {
        let bytes = Data(text.utf8)
        let file = root.appendingPathComponent(UUID().uuidString)
        try bytes.write(to: file)
        return DownloadedDocument(
            temporaryURL: file,
            metadata: DocumentFileMetadata(
                byteCount: responseSize ?? bytes.count, contentType: "application/pdf",
                fileName: "../../Ticket.pdf"))
    }

    internal func navigation(
        owner: TripDocumentOfflineOwner? = nil, associationTrip: Int = 7, selectedTrip: Int? = 7
    ) -> TripDocumentOfflineNavigation {
        let trip = TripRecord(
            id: 7, name: "Trip", destination: "", when: "after Christmas, perhaps longer",
            tagId: nil, parentId: nil, notes: "Original", sourceLinks: [])
        let association = TripDocumentAssociation(
            id: 91, tripId: associationTrip, documentId: 12, targetKind: "trip", targetId: 7,
            createdAt: verifiedAt)
        let snapshot = TripSnapshot(
            trip: trip, places: [], visits: [], journeys: [], journeyGroups: [], stays: [],
            events: [],
            documentAssociations: [association])
        let original = DocumentOriginal(
            id: 12, title: "Ticket", created: "2026-11-01", originalFileName: "Ticket.pdf",
            thumbnailUrl: "")
        return TripDocumentOfflineNavigation(
            owner: owner ?? current,
            catalogue: VerifiedTripCatalogue(trips: [trip], verifiedAt: verifiedAt),
            trips: [VerifiedTripSnapshot(snapshot: snapshot, verifiedAt: verifiedAt)],
            originals: [VerifiedDocumentOriginal(original: original, verifiedAt: verifiedAt)],
            selectedTripID: selectedTrip)
    }

    internal func navigation(
        targetKind: String, targetID: Int, sourceTripID: Int = 7
    ) -> TripDocumentOfflineNavigation {
        let base = navigation()
        let trip = base.trips[0].snapshot.trip
        let visit = TripVisit(
            id: 21, tripId: sourceTripID, placeId: 1,
            timing: TripVisitTiming(arrival: nil, departure: nil, month: nil, duration: nil),
            notes: "", sourceLinks: [])
        let journey = TripJourney(
            id: 40, tripId: sourceTripID, name: nil, reference: nil, notes: "", sourceLinks: [],
            buffers: TripJourneyBuffers(minimumConnectionMinutes: nil, airportBufferMinutes: nil),
            legs: [])
        let stay = TripStay(
            id: 70, tripId: sourceTripID, visitId: nil, name: nil, kind: nil, status: nil,
            timing: TripStayTiming(
                arrival: nil, departure: nil, checkIn: nil, checkOut: nil, timeZone: nil),
            address: nil, reference: nil, notes: "", sourceLinks: [], hostLinks: [],
            documentLinks: [])
        let event = TripEvent(
            id: 80, tripId: sourceTripID, visitId: nil, name: nil, intention: nil, arrangement: nil,
            purchase: nil,
            timing: TripEventTiming(
                start: nil, end: nil, startTime: nil, endTime: nil, timeZone: nil),
            address: nil, reference: nil, sourceUrl: nil, ticketUrl: nil, notes: "",
            sourceLinks: [],
            venueLinks: [], organiserLinks: [], documentLinks: [])
        let association = TripDocumentAssociation(
            id: 91, tripId: trip.id, documentId: 12, targetKind: targetKind, targetId: targetID,
            createdAt: verifiedAt)
        let snapshot = TripSnapshot(
            trip: trip, places: [TripPlace(id: 1, name: "Place", sourceLinks: [])],
            visits: [visit], journeys: [journey], journeyGroups: [], stays: [stay],
            events: [event], documentAssociations: [association])
        return TripDocumentOfflineNavigation(
            owner: current, catalogue: base.catalogue,
            trips: [VerifiedTripSnapshot(snapshot: snapshot, verifiedAt: verifiedAt)],
            originals: base.originals, selectedTripID: trip.id)
    }

    internal func namespace(_ owner: TripDocumentOfflineOwner? = nil) throws -> URL {
        try store(owner).directory()
    }
}
