import Testing

@testable import DesignPlayground

@Suite("Trips browser Today alternatives")
internal struct TripsBrowserTodayTests {
    @Test("Alternative-only hotel is absent from Today while the selected hotel remains next")
    func alternativeOnly() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let today = tripsBrowserTodayState(trip)
        #expect(!today.stays.contains { $0.id == "recife-stay" })
        #expect(today.stays.contains { $0.id == "olinda-switch" })
        #expect(!tripsTodayProjection(today).sources.contains { $0.id == "recife-stay" })
        #expect(tripsTodayProjection(today).sources.contains { $0.id == "olinda-switch" })
        #expect(today.now == trip.today.now)
        #expect(today.displayZone == trip.today.displayZone)
        #expect(today.lodgingWindows == trip.today.lodgingWindows)
    }

    @Test("An alternative also selected by a visit or transport entry remains included")
    func selectedAlternative() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let index = try #require(trip.visits.firstIndex { $0.id == "olinda-visit" })
        trip.visits[index].sourceIDs.append("recife-stay")
        trip.route.append(
            .alternative(
                .init(
                    id: "outbound-option", title: "Outbound option",
                    detail: "", sourceIDs: ["outbound"])))
        let today = tripsBrowserTodayState(trip)
        #expect(today.stays.contains { $0.id == "recife-stay" })
        #expect(today.journeys.contains { $0.id == "outbound" })
    }

    @Test("Alternative filtering covers all source kinds without dropping unassociated records")
    func allSourceKinds() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        trip.route = [
            .alternative(
                .init(
                    id: "choices", title: "Choices", detail: "",
                    sourceIDs: ["carmo", "outbound", "concert"]))
        ]
        let today = tripsBrowserTodayState(trip)
        #expect(!today.stays.contains { $0.id == "carmo" })
        #expect(!today.journeys.contains { $0.id == "outbound" })
        #expect(!today.events.contains { $0.id == "concert" })
        #expect(today.stays.contains { $0.id == "recife-stay" })
        #expect(today.journeys.contains { $0.id == "return" })
        #expect(today.events.contains { $0.id == "marina-coffee" })
    }

    @Test(
        "Projection preserves the original catalogue, searchable alternatives and source metadata")
    func sourcePreservation() throws {
        let state = tripsBrowserFixture()
        let before = state
        let trip = try #require(tripsBrowserSelectedTrip(state))
        _ = tripsBrowserTodayState(trip)
        #expect(state == before)
        #expect(tripsTodaySource(trip.today, id: "recife-stay") != nil)
        #expect(
            tripsBrowserSearch(
                state, query: "Recife hotel", scope: .selectedTrip,
                kind: .booking
            ).map(\.recordID) == ["recife-stay"])
        let original = try #require(trip.today.stays.first { $0.id == "carmo" })
        #expect(tripsBrowserTodayState(trip).stays.first { $0.id == "carmo" } == original)
    }

    @Test(
        "Missing route references cannot substitute names, and no alternatives is an identity projection"
    )
    func unresolvedAndEmpty() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        trip.route = [
            .visit("missing"),
            .alternative(
                .init(
                    id: "choice", title: "Choice", detail: "",
                    sourceIDs: ["carmo"])),
        ]
        #expect(!tripsBrowserTodayState(trip).stays.contains { $0.id == "carmo" })
        trip.route = []
        #expect(tripsBrowserTodayState(trip) == trip.today)
    }
}
