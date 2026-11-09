import Testing

@testable import DesignPlayground

@Suite("Trips Today day window")
internal struct TripsTodayTimelineTests {
    @Test("Chronology compares instants across offsets rather than ISO text or source order")
    func offsetOrdering() {
        var state = tripsTodayFixture(.empty)
        state.now = "2027-12-29T12:00:00Z"
        state.displayZone = "UTC"
        state.events = [
            .init(
                id: "later", name: "Later event",
                start: .init(at: "2027-12-29T08:00:00-03:00", timeZone: "America/Recife"),
                essentials: .init(), purchased: false),
            .init(
                id: "earlier", name: "Earlier event",
                start: .init(at: "2027-12-29T11:00:00+01:00", timeZone: "Europe/Paris"),
                essentials: .init(), purchased: false),
        ]
        let projection = tripsTodayProjection(state)
        #expect(projection.sources.map(\.id) == ["earlier", "later"])
        #expect(projection.commitments.map { $0.source.id } == ["earlier", "later"])
        #expect(projection.sources == state.events.reversed().map(TripsTodaySource.event))
    }

    @Test("Overnight endpoints belong to the selected display day without changing source clocks")
    func overnight() throws {
        var state = tripsTodayFixture(.empty)
        state.now = "2027-12-29T01:00:00-03:00"
        let start = TripsTodayClock(at: "2027-12-28T23:00:00-03:00", timeZone: "America/Recife")
        let end = TripsTodayClock(at: "2027-12-29T02:00:00-03:00", timeZone: "America/Recife")
        state.events = [
            .init(
                id: "overnight", name: "Late meeting", start: start, end: end,
                agreement: "Agreed", essentials: .init(), purchased: false)
        ]
        let local = tripsTodayProjection(state)
        #expect(local.commitments.count == 1)
        #expect(local.commitments.first?.boundary == .end)
        #expect(local.commitments.first?.clock == end)
        #expect(local.sources.first?.purchased == false)
        state.displayZone = "Australia/Sydney"
        let shifted = tripsTodayProjection(state)
        #expect(shifted.day == "2027-12-29")
        #expect(shifted.commitments.map(\.boundary) == [.start, .end])
        let source = try #require(shifted.sources.first)
        #expect(source == .event(state.events[0]))
    }
}
