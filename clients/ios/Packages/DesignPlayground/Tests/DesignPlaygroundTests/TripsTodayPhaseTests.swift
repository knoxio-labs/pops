import Testing

@testable import DesignPlayground

@Suite("Trips Today Now and Next")
internal struct TripsTodayPhaseTests {
    @Test("All precise source kinds use inclusive start and exclusive end")
    func intervalBoundaries() {
        for source in boundedSources() {
            #expect(tripsTodaySourcePhase(source, now: "2027-12-29T09:59:59Z") == .next)
            #expect(tripsTodaySourcePhase(source, now: "2027-12-29T10:00:00Z") == .now)
            #expect(tripsTodaySourcePhase(source, now: "2027-12-29T11:00:00Z") == .now)
            #expect(tripsTodaySourcePhase(source, now: "2027-12-29T12:00:00Z") == .other)
        }
    }

    @Test("Known future starts need no invented end, while open past starts cannot assert ongoing")
    func unknownEnd() {
        let start = TripsTodayClock(at: "2027-12-29T10:00:00Z", timeZone: "UTC")
        let sources: [TripsTodaySource] = [
            .stay(
                .init(id: "stay", name: "Stay", from: start, essentials: .init(), purchased: false)),
            .journey(
                .init(
                    id: "journey", name: "Journey",
                    legs: [
                        .init(id: "leg", name: "Leg", departure: start)
                    ], essentials: .init(), purchased: false)),
            .event(
                .init(
                    id: "event", name: "Event", start: start, agreement: "Agreed",
                    essentials: .init(), purchased: false)),
        ]
        for source in sources {
            #expect(tripsTodaySourcePhase(source, now: "2027-12-29T09:00:00Z") == .next)
            #expect(tripsTodaySourcePhase(source, now: "2027-12-29T10:00:00Z") == .other)
            #expect(tripsTodaySourcePhase(source, now: "2027-12-29T11:00:00Z") == .other)
        }
    }

    @Test("Date-only and unresolved timing cannot become Next by comparing calendar labels")
    func untimed() {
        let event = TripsTodayEvent(
            id: "day", name: "Date only", day: "2027-12-30",
            essentials: .init(), purchased: true)
        #expect(tripsTodaySourcePhase(.event(event), now: "2027-12-29T10:00:00Z") == .other)
        var invalid = event
        invalid.start = .init(at: "2027-02-30T10:00:00Z", timeZone: "UTC")
        #expect(tripsTodaySourcePhase(.event(invalid), now: "2027-02-28T10:00:00Z") == .other)
        invalid.start = .init(at: "2027-12-30T10:00:00Z", timeZone: "Missing/Zone")
        #expect(tripsTodaySourcePhase(.event(invalid), now: "2027-12-29T10:00:00Z") == .other)
        #expect(tripsTodaySourcePhase(.event(event), now: "invalid") == .other)
    }

    @Test("Phase filters keep the projected identities and future chronology unchanged")
    func projectionOrder() {
        var state = tripsTodayFixture(.empty)
        state.now = "2027-12-29T10:00:00Z"
        state.displayZone = "UTC"
        state.events = [
            .init(
                id: "later", name: "Same name",
                start: .init(at: "2027-12-29T12:00:00Z", timeZone: "UTC"),
                essentials: .init(), purchased: false),
            .init(
                id: "earlier", name: "Same name",
                start: .init(at: "2027-12-29T11:00:00Z", timeZone: "UTC"),
                essentials: .init(), purchased: true),
        ]
        let before = state
        let projection = tripsTodayProjection(state)
        let upcoming = projection.sources.filter {
            tripsTodaySourcePhase($0, now: state.now) == .next
        }
        #expect(upcoming.map(\.id) == ["earlier", "later"])
        #expect(upcoming == projection.sources)
        #expect(state == before)
    }

    @Test("All known future kinds precede later journeys without a fixture-specific time cap")
    func futureAcrossKinds() {
        let state = tripsTodayFixture()
        let before = state
        let projection = tripsTodayProjection(state)
        let future = projection.sources.filter {
            tripsTodaySourcePhase($0, now: state.now) == .next
        }
        #expect(future.map(\.id) == ["concert", "recife-stay", "return"])
        #expect(future.map(\.kind) == [.event, .stay, .journey])
        #expect(projection.nextJourney?.id == "return")
        #expect(state == before)
    }

    private func boundedSources() -> [TripsTodaySource] {
        let start = TripsTodayClock(at: "2027-12-29T10:00:00Z", timeZone: "UTC")
        let end = TripsTodayClock(at: "2027-12-29T12:00:00Z", timeZone: "UTC")
        return [
            .stay(
                .init(
                    id: "stay", name: "Stay", from: start, to: end,
                    essentials: .init(), purchased: false)),
            .journey(
                .init(
                    id: "journey", name: "Journey",
                    legs: [
                        .init(id: "leg", name: "Leg", departure: start, arrival: end)
                    ], essentials: .init(), purchased: false)),
            .event(
                .init(
                    id: "event", name: "Event", start: start, end: end,
                    agreement: "Agreed", essentials: .init(), purchased: false)),
        ]
    }
}
