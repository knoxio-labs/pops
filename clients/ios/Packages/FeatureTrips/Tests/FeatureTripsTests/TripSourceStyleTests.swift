import AppCore
import DesignSystem
import SwiftUI
import Testing

@testable import FeatureTrips

@Suite("Trip source style")
internal struct TripSourceStyleTests {
    @Test("source kinds and flight legs use semantic colour tokens")
    internal func semanticColours() throws {
        let snapshot = try TripTestSources.snapshot()
        let stay = try #require(snapshot.stays.first)
        let flight = try #require(snapshot.journeys.first)
        let event = TripEvent(
            id: 8, tripId: 1, visitId: nil, name: "Theatre", intention: nil,
            arrangement: nil, purchase: nil,
            timing: TripEventTiming(
                start: nil, end: nil, startTime: nil, endTime: nil, timeZone: nil),
            address: nil, reference: nil, sourceUrl: nil, ticketUrl: nil, notes: "",
            sourceLinks: [], venueLinks: [], organiserLinks: [], documentLinks: [])

        #expect(TripsSourceStyle(source: .stay(stay)).accent == .popsTripsStay)
        #expect(TripsSourceStyle(source: .journey(flight)).accent == .popsAccent)
        #expect(TripsSourceStyle(source: .event(event)).accent == .popsTripsActivity)
    }
}
