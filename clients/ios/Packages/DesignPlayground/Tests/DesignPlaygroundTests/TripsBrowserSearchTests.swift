import Testing

@testable import DesignPlayground

@Suite("Trips browser source search")
internal struct TripsBrowserSearchTests {
    @Test("Case and accents normalize without replacing source titles or identities")
    func normalizedSearch() {
        let state = tripsBrowserFixture()
        let places = tripsBrowserSearch(
            state, query: " SAO PAULO ", scope: .selectedTrip, kind: .place)
        #expect(places.map(\.recordID) == ["sao-paulo"])
        #expect(places.first?.title == "São Paulo")
        let booking = tripsBrowserSearch(
            state, query: "demo-carmo-29", scope: .selectedTrip, kind: .booking)
        #expect(booking.map(\.recordID) == ["carmo"])
        #expect(
            tripsBrowserSearch(state, query: "FLORIANOPOLIS", scope: .selectedTrip).contains {
                $0.recordID == "florianopolis"
            })
    }

    @Test(
        "Method values, addresses, document metadata and saved locations are searchable source facts"
    )
    func linkedFacts() {
        let state = tripsBrowserFixture()
        #expect(
            tripsBrowserSearch(
                state, query: "reservas@carmo.example.test", scope: .selectedTrip,
                kind: .contact
            ).map(\.recordID) == ["carmo-contact"])
        #expect(
            tripsBrowserSearch(
                state, query: "Rua do Amparo", scope: .selectedTrip,
                kind: .contact
            ).map(\.recordID) == ["carmo-contact"])
        #expect(
            tripsBrowserSearch(
                state, query: "poa-rec-ticket.pdf", scope: .selectedTrip,
                kind: .document
            ).map(\.recordID) == ["poa-ticket"])
        #expect(
            tripsBrowserSearch(
                state, query: "Recife", scope: .selectedTrip,
                kind: .idea
            ).map(\.recordID) == ["recife-museum"])
        #expect(
            tripsBrowserSearch(
                state, query: "lina@example.test", scope: .selectedTrip,
                kind: .booking
            ).isEmpty)
    }

    @Test("History requires explicit all-trip scope and retains distinct equal-name contacts")
    func historyScope() {
        let state = tripsBrowserFixture()
        #expect(tripsBrowserSearch(state, query: "Lisboa", scope: .selectedTrip).isEmpty)
        let documents = tripsBrowserSearch(
            state, query: "Lisboa", scope: .allTrips, kind: .document)
        #expect(documents.map(\.tripID) == ["portugal-plan"])
        #expect(documents.map(\.recordID) == ["old-plan"])
        let contacts = tripsBrowserSearch(
            state, query: "Marina Duarte", scope: .allTrips, kind: .contact)
        #expect(contacts.count == 2)
        #expect(Set(contacts.map(\.id)).count == 2)
        #expect(Set(contacts.map(\.recordID)) == ["marina", "marina-old"])
    }

    @Test("Missing selection never substitutes another trip and empty catalogues remain empty")
    func missingSelection() {
        var state = tripsBrowserFixture()
        state.selectedTripID = "missing"
        #expect(tripsBrowserSelectedTrip(state) == nil)
        #expect(tripsBrowserSearch(state, query: "", scope: .selectedTrip).isEmpty)
        #expect(!tripsBrowserSearch(state, query: "", scope: .allTrips).isEmpty)
        #expect(
            tripsBrowserSearch(tripsBrowserFixture(.empty), query: "", scope: .allTrips).isEmpty)
    }
}
