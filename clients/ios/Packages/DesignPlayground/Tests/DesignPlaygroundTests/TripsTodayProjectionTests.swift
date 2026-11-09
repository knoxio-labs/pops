import Testing

@testable import DesignPlayground

@Suite("Trips Today deterministic projection")
internal struct TripsTodayProjectionTests {
    @Test("Both layouts receive one source union with unchanged operational details")
    func sourceUnion() throws {
        let state = tripsTodayFixture()
        let before = state
        let projection = tripsTodayProjection(state)
        #expect(projection.day == "2027-12-29")
        #expect(projection.currentStays.map(\.id) == ["carmo"])
        #expect(projection.nextJourney?.id == "return")
        #expect(
            Set(projection.sources.map(\.id)) == [
                "carmo", "marina-coffee", "poa-rec", "concert", "recife-stay", "return",
            ])
        let source = try #require(tripsTodaySource(state, id: "carmo"))
        #expect(source.purchased)
        #expect(source.kind == .stay)
        #expect(source.essentials.reference == "DEMO-CARMO-29")
        #expect(source.essentials.documents.first?.availability == .available)
        #expect(tripsTodaySource(state, id: "missing") == nil)
        #expect(state == before)
    }

    @Test("Stay start is inclusive and checkout exclusive")
    func stayBoundaries() {
        var state = tripsTodayFixture()
        state.now = "2027-12-29T13:59:59-03:00"
        #expect(tripsTodayProjection(state).currentStays.isEmpty)
        state.now = "2027-12-29T14:00:00-03:00"
        #expect(tripsTodayProjection(state).currentStays.map(\.id) == ["carmo"])
        state.now = "2028-01-03T11:00:00-03:00"
        #expect(tripsTodayProjection(state).currentStays.isEmpty)
    }

    @Test("Ongoing journeys remain next until arrival, not until departure")
    func ongoingJourney() {
        var state = tripsTodayFixture(.travelDay)
        #expect(tripsTodayProjection(state).nextJourney?.id == "poa-rec")
        state.now = "2027-12-29T01:00:00-03:00"
        #expect(tripsTodayProjection(state).nextJourney?.id == "poa-rec")
        state.now = "2027-12-29T03:40:00-03:00"
        #expect(tripsTodayProjection(state).nextJourney?.id == "return")
    }

    @Test("Multileg chronology uses instants and preserves every endpoint zone")
    func multileg() throws {
        var state = tripsTodayFixture(.outbound)
        let journey = try #require(tripsTodayProjection(state).nextJourney)
        #expect(journey.id == "outbound")
        #expect(
            journey.legs.map { $0.departure?.timeZone } == ["Australia/Sydney", "America/Chicago"])
        state.now = "2027-11-24T18:00:00+11:00"
        #expect(tripsTodayProjection(state).nextJourney?.id == "outbound")
        #expect(
            tripsTodayProjection(state).commitments.filter { $0.source.id == "outbound" }.count == 1
        )
    }

    @Test("Day continuations and date-only commitments never fabricate midnight")
    func dayOnly() throws {
        let quiet = tripsTodayProjection(tripsTodayFixture(.quiet))
        let continuation = try #require(quiet.commitments.first { $0.source.id == "carmo" })
        #expect(continuation.boundary == .continuing)
        #expect(continuation.clock == nil)
        let today = tripsTodayProjection(tripsTodayFixture())
        let coffee = try #require(today.commitments.first { $0.source.id == "marina-coffee" })
        #expect(coffee.clock == nil)
        #expect(!coffee.source.purchased)
        let dinner = tripsTodaySource(tripsTodayFixture(), id: "dinner")
        #expect(dinner?.purchased == false)
    }

    @Test("Unknown timing remains inspectable and cannot become current or next")
    func unresolvedSources() {
        let state = tripsTodayFixture(.unknownTimes)
        let projection = tripsTodayProjection(state)
        #expect(projection.currentStays.isEmpty)
        #expect(projection.nextJourney == nil)
        #expect(projection.findings.contains { $0.sourceIDs == ["undated-journey"] })
        #expect(tripsTodaySource(state, id: "undated-journey")?.name == "Recife to Florianópolis")
        #expect(!projection.commitments.contains { $0.source.id == "undated-meeting" })
        #expect(tripsTodayProjection(tripsTodayFixture(.empty)).sources.isEmpty)
    }
}
