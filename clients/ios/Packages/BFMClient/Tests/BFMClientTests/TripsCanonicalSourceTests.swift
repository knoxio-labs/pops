import AppCore
import Testing

@testable import BFMClient

@Suite("Complete canonical Trips wire")
internal struct TripsCanonicalSourceTests {
    @Test(
        "events, repeated original associations and one-sided duration survive exact source reads")
    internal func canonicalSources() async throws {
        let repository = try BFMTripsRepository.stubbed(StubTransport(status: .ok, json: payload))
        let value = try #require(try await repository.trip(id: 1))
        let event = try #require(value.events.first)
        #expect(event.id == 7)
        #expect(event.timing.start == "2026-01-02")
        #expect(event.timing.startTime == nil)
        #expect(event.timing.timeZone == nil)
        #expect(event.intention == "Considering")
        #expect(event.arrangement == "Not arranged")
        #expect(event.purchase == "Purchased")
        #expect(value.visits.first?.timing.duration?.min == 2)
        #expect(value.visits.first?.timing.duration?.max == nil)
        #expect(value.visits.first?.timing.duration?.unit == "weeks")
        #expect(value.documentAssociations.map(\.id) == [70, 71])
        #expect(value.documentAssociations.map(\.documentId) == [99, 99])
        let created = try #require(
            value.documentAssociations.first?.createdAt.timeIntervalSince1970)
        #expect(abs(created - 1_767_225_600.123) < 0.000_01)
    }

    @Test(
        "missing required collections and mismatched event or association ownership never become partial success"
    )
    internal func invalidSources() async throws {
        let variants = [
            payload.replacingOccurrences(of: "\"events\":[\(event)],", with: ""),
            payload.replacingOccurrences(
                of: "\"documentAssociations\":[\(associations)],", with: ""),
            payload.replacingOccurrences(
                of: "\"id\":7,\"tripId\":1", with: "\"id\":7,\"tripId\":999"),
            payload.replacingOccurrences(
                of: "\"id\":70,\"tripId\":1", with: "\"id\":70,\"tripId\":999"),
        ]
        for body in variants {
            #expect(body != payload)
            let repository = try BFMTripsRepository.stubbed(StubTransport(status: .ok, json: body))
            await #expect(throws: RepositoryError.contractMismatch) {
                try await repository.trip(id: 1)
            }
        }
    }

    private var payload: String {
        TripsWire.detail
            .replacingOccurrences(of: "\"events\":[]", with: "\"events\":[\(event)]")
            .replacingOccurrences(
                of: "\"documentAssociations\":[]",
                with: "\"documentAssociations\":[\(associations)]"
            )
            .replacingOccurrences(of: "\"visits\":[]", with: "\"visits\":[\(visit)]")
    }

    private var event: String {
        """
        {"id":7,"tripId":1,"visitId":4,"name":"Source event","intention":"Considering",\
        "arrangement":"Not arranged","purchase":"Purchased","timing":{"start":"2026-01-02"},\
        "address":null,"reference":"EVT7","sourceUrl":null,"ticketUrl":null,"notes":"",\
        "sourceLinks":[],"venueLinks":[],"organiserLinks":[],"documentLinks":[],\
        "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}
        """
    }

    private var associations: String {
        """
        {"id":70,"tripId":1,"documentId":99,"targetKind":"event","targetId":7,\
        "createdAt":"2026-01-01T00:00:00.123Z"},\
        {"id":71,"tripId":1,"documentId":99,"targetKind":"trip","targetId":1,\
        "createdAt":"2026-01-01T00:00:00.123Z"}
        """
    }

    private var visit: String {
        """
        {"id":4,"tripId":1,"placeId":1,"timing":{"duration":{"min":2,"unit":"weeks"}},\
        "notes":"","sourceLinks":[],"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}
        """
    }
}
