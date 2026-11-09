import Testing
import ViewInspector

@testable import DesignPlayground

@Suite("Trip Today Now then Next hierarchy")
@MainActor
internal struct TripTodayPriorityTests {
    private func rowIDs(_ state: TripsTodayState) throws -> [String] {
        let view = TripTodayView(state: state, layout: .nextFirst)
        return try view.inspect().findAll(TripTodayRow.self).map { try $0.actualView().source.id }
    }

    @Test("current accommodation precedes the concert, next stay and later flight")
    func nowPrecedesChronologicalFuturePlans() throws {
        let state = tripsTodayFixture()
        let ids = try rowIDs(state)
        #expect(ids.first == "carmo")
        let concert = try #require(ids.firstIndex(of: "concert"))
        let stay = try #require(ids.firstIndex(of: "recife-stay"))
        let flight = try #require(ids.firstIndex(of: "return"))
        let dateOnly = try #require(ids.firstIndex(of: "marina-coffee"))
        #expect(concert < stay)
        #expect(stay < flight)
        #expect(flight < dateOnly)
        #expect(ids.count == Set(ids).count)
        let inspected = try TripTodayView(state: state, layout: .nextFirst).inspect()
        #expect(try inspected.find(text: "Now").string() == "Now")
        #expect(try inspected.find(text: "Next").string() == "Next")
        #expect(try inspected.find(text: "Today").string() == "Today")
        let rows = try inspected.findAll(TripTodayRow.self).map { try $0.actualView() }
        let futureStay = try #require(rows.first { $0.source.id == "recife-stay" })
        let future = try futureStay.inspect()
        #expect(
            try future.find(text: "From 3 Jan 2028 · 14:00").string() == "From 3 Jan 2028 · 14:00")
    }

    @Test("in-progress journeys and events stay in Now despite their future arrival and end")
    func activeSourcesDoNotBecomeNextAtFutureBoundaries() throws {
        var state = tripsTodayFixture()
        state.now = "2027-12-29T16:00:00-03:00"
        state.journeys.append(
            .init(
                id: "active-journey", name: "Current journey",
                legs: [
                    .init(
                        id: "active-leg", name: "Recorded segment",
                        departure: .init(
                            at: "2027-12-29T15:00:00-03:00", timeZone: "America/Recife"),
                        arrival: .init(at: "2027-12-29T18:00:00-03:00", timeZone: "America/Recife"))
                ], essentials: .init(), purchased: false))
        state.events.append(
            .init(
                id: "active-event", name: "Current event",
                start: .init(at: "2027-12-29T15:30:00-03:00", timeZone: "America/Recife"),
                end: .init(at: "2027-12-29T17:00:00-03:00", timeZone: "America/Recife"),
                essentials: .init(), purchased: false))
        let ids = try rowIDs(state)
        #expect(Array(ids.prefix(3)) == ["carmo", "active-journey", "active-event"])
        let firstNext = try #require(ids.firstIndex(of: "concert"))
        #expect(firstNext == 3)
        #expect(ids.filter { $0 == "active-journey" }.count == 1)
        #expect(ids.filter { $0 == "active-event" }.count == 1)
    }
}
