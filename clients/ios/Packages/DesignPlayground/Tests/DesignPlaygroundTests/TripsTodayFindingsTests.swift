import Testing

@testable import DesignPlayground

@Suite("Trips Today source issues")
internal struct TripsTodayFindingsTests {
    @Test("All overlapping current stays survive without an arbitrary winner")
    func overlap() {
        let projection = tripsTodayProjection(tripsTodayFixture(.overlapping))
        #expect(projection.currentStays.count == 2)
        #expect(projection.findings.contains { $0.id == "stay-overlap" && $0.sourceIDs.count == 2 })
    }

    @Test("Declared bounded lodging gaps use union coverage and exact touching boundaries")
    func lodgingCoverage() throws {
        var state = tripsTodayFixture()
        #expect(tripsTodayProjection(state).findings.contains { $0.id == "olinda-window:gap" })
        let index = try #require(state.stays.firstIndex { $0.id == "recife-stay" })
        state.stays[index].from?.at = "2028-01-03T11:00:00-03:00"
        #expect(!tripsTodayProjection(state).findings.contains { $0.id == "olinda-window:gap" })
        state.lodgingWindows[0].to = nil
        let findings = tripsTodayProjection(state).findings
        #expect(!findings.contains { $0.id == "olinda-window:gap" })
        #expect(findings.contains { $0.id == "olinda-window:timing" })
        state.lodgingWindows = []
        state.stays = []
        #expect(!tripsTodayProjection(state).findings.contains { $0.id.hasSuffix(":gap") })
    }

    @Test("Known future departure does not require an invented arrival")
    func upcomingOpenArrival() throws {
        var state = tripsTodayFixture(.travelDay)
        let index = try #require(state.journeys.firstIndex { $0.id == "poa-rec" })
        state.journeys[index].legs[0].arrival = nil
        let projection = tripsTodayProjection(state)
        #expect(projection.nextJourney?.id == "poa-rec")
        #expect(projection.nextJourney?.legs.first?.arrival == nil)
        #expect(projection.findings.contains { $0.sourceIDs == ["poa-rec"] })
        state.now = "2027-12-29T01:00:00-03:00"
        #expect(tripsTodayProjection(state).nextJourney?.id == "return")
    }

    @Test("Missing first departure cannot borrow another segment's clock")
    func missingFirstDeparture() throws {
        var state = tripsTodayFixture(.outbound)
        let index = try #require(state.journeys.firstIndex { $0.id == "outbound" })
        state.journeys[index].legs[0].departure = nil
        let projection = tripsTodayProjection(state)
        #expect(projection.nextJourney?.id == "poa-rec")
        #expect(projection.findings.contains { $0.sourceIDs == ["outbound"] })
        #expect(tripsTodaySource(state, id: "outbound") != nil)
    }

    @Test("Invalid and reversed source timing stays inspectable outside today's projection")
    func invalidSourceTiming() throws {
        var state = tripsTodayFixture()
        let index = try #require(state.stays.firstIndex { $0.id == "carmo" })
        state.stays[index].from?.at = "2027-02-30T14:00:00-03:00"
        #expect(tripsTodayProjection(state).currentStays.isEmpty)
        #expect(tripsTodayProjection(state).findings.contains { $0.sourceIDs == ["carmo"] })
        state.stays[index].from?.at = "2028-01-04T14:00:00-03:00"
        #expect(tripsTodayProjection(state).currentStays.isEmpty)
        state.now = "invalid"
        let projection = tripsTodayProjection(state)
        #expect(projection.sources.isEmpty)
        #expect(projection.findings.contains { $0.id == "now" })
    }

    @Test("Recorded document availability never changes through projection")
    func documentAvailability() {
        let state = tripsTodayFixture(.unavailable)
        let before = state
        let projection = tripsTodayProjection(state)
        #expect(
            projection.currentStays.first?.essentials.documents.first?.availability == .unavailable)
        #expect(state == before)
    }
}
