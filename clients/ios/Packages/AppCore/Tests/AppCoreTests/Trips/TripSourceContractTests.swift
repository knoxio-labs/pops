import Foundation
import Testing

@testable import AppCore

@Suite("Trip source contracts")
internal struct TripSourceContractTests {
    @Test("independent endpoint components and unfamiliar source labels are retained verbatim")
    internal func endpointSource() throws {
        let decoder = JSONDecoder()
        let source = Data(
            #"{"local":"2026-01-02T12:00","sourceLabel":"Gate supplied by operator"}"#.utf8)
        let endpoint = try decoder.decode(TripEndpoint.self, from: source)
        #expect(endpoint.local == "2026-01-02T12:00")
        #expect(endpoint.timeZone == nil)
        #expect(endpoint.placeId == nil)
        #expect(endpoint.sourceLabel == "Gate supplied by operator")
        let restored = try decoder.decode(TripEndpoint.self, from: JSONEncoder().encode(endpoint))
        #expect(restored == endpoint)
    }

    @Test("floating stay dates never fill check-in, checkout or source zone")
    internal func floatingStay() throws {
        let value = try JSONDecoder().decode(
            TripStayTiming.self,
            from: Data(#"{"arrival":"2026-01-02","departure":"2026-01-05"}"#.utf8))
        #expect(value.arrival == "2026-01-02")
        #expect(value.departure == "2026-01-05")
        #expect(value.checkIn == nil)
        #expect(value.checkOut == nil)
        #expect(value.timeZone == nil)
    }

    @Test("explicit document references remain references without a fabricated availability field")
    internal func references() throws {
        let source = TripSourceLink(uri: "pops:documents/document/123", label: "Confirmation")
        let value = try JSONDecoder().decode(
            TripSourceLink.self, from: JSONEncoder().encode(source))
        #expect(value == source)
        #expect(value.uri == "pops:documents/document/123")
    }
}
