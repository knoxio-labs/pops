import AppCore
import SwiftUI
import Testing

@testable import FeatureTrips

@Suite("Practical source detail presentation")
internal struct TripSourceDetailTests {
    @Test("stay details retain raw booking state, independent endpoints and every exact reference")
    internal func stayDetails() {
        let link = TripSourceLink(uri: "pops:documents/original/17", label: " Original ")
        let stay = TripStay(
            id: 4, tripId: 1, visitId: nil, name: "Recorded stay", kind: "Family stay",
            status: "Awaiting reply",
            timing: .init(
                arrival: nil, departure: "2026-01-05", checkIn: "14:30", checkOut: nil,
                timeZone: "UTC"),
            address: " Exact address\nSecond line ", reference: " REF 04 ", notes: "Exact notes",
            sourceLinks: [link, link], hostLinks: [link], documentLinks: [link])
        let detail = TripSourceDetailPresentation(source: .stay(stay))
        #expect(detail.kind == "Stay")
        #expect(detail.states.map(\.value) == ["Family stay", "Awaiting reply"])
        #expect(detail.states.map(\.label) == ["Kind", "Booking state"])
        #expect(detail.timings.map(\.label) == ["Check-in", "Check-out"])
        #expect(detail.timings.first?.day == nil)
        #expect(detail.timings.first?.clock == "14:30")
        #expect(detail.timings.first?.hasUnresolvedClock == true)
        #expect(detail.timings.last?.day == "2026-01-05")
        #expect(detail.timings.last?.clock == nil)
        #expect(
            detail.facts.map(\.value) == [
                " REF 04 ", " Exact address\nSecond line ", "Exact notes",
            ])
        #expect(
            detail.references.map(\.title) == ["Source", "Host references", "Document references"])
        #expect(detail.references.map(\.links) == [[link, link], [link], [link]])
    }

    @Test("absent state and timing do not turn into a booking or midnight")
    internal func absentFacts() {
        let stay = TripStay(
            id: 4, tripId: 1, visitId: nil, name: nil, kind: nil, status: nil,
            timing: .init(arrival: nil, departure: nil, checkIn: nil, checkOut: nil, timeZone: nil),
            address: nil, reference: "", notes: "", sourceLinks: [], hostLinks: [],
            documentLinks: [])
        let detail = TripSourceDetailPresentation(source: .stay(stay))
        #expect(detail.states.isEmpty)
        #expect(detail.facts.isEmpty)
        #expect(detail.references.isEmpty)
        #expect(detail.timings.count == 2)
        #expect(detail.timings.allSatisfy { $0.day == nil && $0.clock == nil && $0.zone == nil })
        #expect(detail.timings.allSatisfy { !$0.hasUnresolvedClock })
        #expect(TripSourceDetailFact("Notes", " ")?.value == " ")
    }

    @Test(
        "event state dimensions and source URLs stay independent without paid or ticket availability claims"
    )
    internal func eventDetails() {
        let link = TripSourceLink(uri: "opaque:source", label: nil)
        let event = TripEvent(
            id: 7, tripId: 1, visitId: nil, name: "Event", intention: "Alternative",
            arrangement: "Not arranged", purchase: "Purchased",
            timing: .init(
                start: "2026-02-02", end: "2026-02-01", startTime: nil, endTime: "16:00",
                timeZone: nil),
            address: "Venue address", reference: "EVT7", sourceUrl: "opaque:source-url",
            ticketUrl: "opaque:ticket-url", notes: "Recorded notes", sourceLinks: [link],
            venueLinks: [link], organiserLinks: [link], documentLinks: [link])
        let detail = TripSourceDetailPresentation(source: .event(event))
        #expect(detail.states.map(\.label) == ["Intention", "Arrangement", "Purchase"])
        #expect(detail.states.map(\.value) == ["Alternative", "Not arranged", "Purchased"])
        #expect(detail.timings.map(\.day) == ["2026-02-02", "2026-02-01"])
        #expect(detail.timings.map(\.clock) == [nil, "16:00"])
        #expect(detail.timings.last?.hasUnresolvedClock == true)
        #expect(
            detail.facts.map(\.value) == [
                "EVT7", "Venue address", "opaque:source-url", "opaque:ticket-url", "Recorded notes",
            ])
        #expect(
            detail.references.map(\.title) == [
                "Source", "Venue references", "Organiser references", "Document references",
            ])
        #expect(detail.references.allSatisfy { $0.links == [link] })
    }

    @Test("unresolvable and ambiguous clocks remain explicit instead of gaining a time zone")
    internal func unresolvedClocks() {
        for timing in [
            TripSourceDetailTiming(label: "Check-in", day: "2026-01-01", clock: "14:00", zone: nil),
            .init(label: "Check-in", day: "2026-01-01", clock: "bad-clock", zone: "UTC"),
            .init(label: "Check-in", day: "2026-11-01", clock: "01:30", zone: "America/New_York"),
            .init(label: "Check-in", day: "2026-03-08", clock: "02:30", zone: "America/New_York"),
        ] {
            #expect(timing.hasUnresolvedClock)
        }
        let precise = TripSourceDetailTiming(
            label: "Check-in", day: "2026-01-01", clock: "14:00", zone: "UTC")
        #expect(!precise.hasUnresolvedClock)
        let dayOnly = TripSourceDetailTiming(
            label: "Check-in", day: "2026-01-01", clock: nil, zone: nil)
        #expect(!dayOnly.hasUnresolvedClock)
    }

    @Test("journey details do not promote a leg purchase to overall booking state")
    internal func journeyDetails() throws {
        let snapshot = try TripTestSources.snapshot()
        let journey = try #require(
            snapshot.journeys.first { journey in
                journey.legs.contains { $0.purchase == "Purchased" }
            })
        let detail = TripSourceDetailPresentation(source: .journey(journey))
        #expect(detail.kind == "Journey")
        #expect(detail.states.isEmpty)
        #expect(detail.timings.isEmpty)
        let leg = try #require(journey.legs.first)
        #expect(leg.purchase == "Purchased")
        let legDetail = TripSourceDetailLegPresentation(leg: leg)
        #expect(legDetail.facts.first { $0.label == "Mode" }?.value == leg.mode)
        #expect(legDetail.facts.first { $0.label == "Reference" }?.value == leg.reference)
        #expect(legDetail.references.isEmpty)
        #expect(journey.legs == snapshot.journeys.first { $0.id == journey.id }?.legs)
    }

    @Test(
        "leg reference groups retain endpoint provenance and duplicate links without resolving their URI"
    )
    internal func endpointReferences() {
        let link = TripSourceLink(uri: "opaque:source-id", label: " Exact label ")
        let leg = TripJourneyLeg(
            id: 9, journeyId: 4, mode: "Recorded mode",
            from: .init(
                placeId: 10, sourceLabel: "Origin", sourceLinks: [link, link],
                local: nil, timeZone: nil, date: "2026-02-02"),
            to: .init(
                placeId: nil, sourceLabel: nil, sourceLinks: [link], local: nil,
                timeZone: nil),
            intention: "Considering", arrangement: "Not arranged", purchase: "Purchased",
            operator: nil, service: nil, reference: " REF ", notes: "Exact notes",
            sourceLinks: [link])
        let detail = TripSourceDetailLegPresentation(leg: leg)
        #expect(detail.facts.map(\.value) == ["Recorded mode", " REF ", "Exact notes"])
        #expect(
            detail.references.map(\.title) == [
                "Leg source", "Departure references", "Arrival references",
            ])
        #expect(detail.references.map(\.links) == [[link], [link, link], [link]])
        #expect(leg.from.date == "2026-02-02")
        #expect(leg.from.local == nil)
    }

    @Test("accessibility sizes stack timing blocks; ordinary sizes still have a fitting fallback")
    internal func accessibleTimingLayout() {
        #expect(!TripSourceDetailSchedule.stacksTiming(at: .large))
        for size in [
            DynamicTypeSize.accessibility1, .accessibility2, .accessibility3,
            .accessibility4, .accessibility5,
        ] {
            #expect(TripSourceDetailSchedule.stacksTiming(at: size))
        }
    }

    @Test("leg headings follow published order while sparse database IDs remain identity only")
    internal func orderedLegHeadings() {
        let legs = [leg(id: 92_010, service: "Z9"), leg(id: 8, service: "A1")]
        let positioned = TripSourceDetailLegPosition.ordered(legs)
        #expect(positioned.map(\.heading) == ["Leg 1", "Leg 2"])
        #expect(positioned.map(\.id) == [92_010, 8])
        #expect(positioned.map(\.leg) == legs)
        let reversed = TripSourceDetailLegPosition.ordered(Array(legs.reversed()))
        #expect(reversed.map(\.heading) == ["Leg 1", "Leg 2"])
        #expect(reversed.map(\.id) == [8, 92_010])
        #expect(TripSourceDetailLegPosition.ordered([]).isEmpty)
    }

    private func leg(id: Int, service: String) -> TripJourneyLeg {
        let endpoint = TripEndpoint(
            placeId: nil, sourceLabel: nil, sourceLinks: nil, local: nil, timeZone: nil)
        return TripJourneyLeg(
            id: id, journeyId: 4, mode: nil, from: endpoint, to: endpoint,
            intention: nil, arrangement: nil, purchase: nil, operator: nil, service: service,
            reference: nil, notes: "", sourceLinks: [])
    }
}
