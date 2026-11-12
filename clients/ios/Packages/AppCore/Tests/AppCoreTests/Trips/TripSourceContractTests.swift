import Foundation
import Testing

@testable import AppCore

@Suite("Trip source contracts")
internal struct TripSourceContractTests {
    @Test("day-only endpoint round trips retain the supplied day without a clock or zone")
    internal func endpointDay() throws {
        let endpoint = try JSONDecoder().decode(
            TripEndpoint.self, from: Data(#"{"date":"2028-02-29"}"#.utf8))
        #expect(endpoint.date == "2028-02-29")
        #expect(endpoint.local == nil)
        #expect(endpoint.timeZone == nil)
        let restored = try JSONDecoder().decode(
            TripEndpoint.self, from: JSONEncoder().encode(endpoint))
        #expect(restored == endpoint)
        let legacy = try JSONDecoder().decode(TripEndpoint.self, from: Data(#"{}"#.utf8))
        #expect(legacy.date == nil)
    }

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

    @Test("duration bounds remain independently absent across source round trips")
    internal func durationBounds() throws {
        for source in [#"{"min":2,"unit":"weeks"}"#, #"{"max":5,"unit":"days"}"#] {
            let duration = try JSONDecoder().decode(TripVisitDuration.self, from: Data(source.utf8))
            let restored = try JSONDecoder().decode(
                TripVisitDuration.self, from: JSONEncoder().encode(duration))
            #expect(restored == duration)
            #expect((duration.min == nil) != (duration.max == nil))
        }
        let minimum = try JSONDecoder().decode(
            TripVisitDuration.self, from: Data(#"{"min":2,"unit":"weeks"}"#.utf8))
        #expect(minimum.min == 2)
        #expect(minimum.max == nil)
        #expect(minimum.unit == "weeks")
        let maximum = try JSONDecoder().decode(
            TripVisitDuration.self, from: Data(#"{"max":5,"unit":"days"}"#.utf8))
        #expect(maximum.min == nil)
        #expect(maximum.max == 5)
        #expect(maximum.unit == "days")
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
