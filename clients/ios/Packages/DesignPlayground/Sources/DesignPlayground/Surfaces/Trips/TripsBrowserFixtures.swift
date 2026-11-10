/// Named fictional browser snapshots, without live network, files or device-clock dependencies.
internal enum TripsBrowserScenario: String, CaseIterable, Sendable {
    case `default`, empty, missingReferences

    /// Playground state selector title.
    internal var title: String {
        switch self {
        case .default: "Brazil and other plans"
        case .empty: "Empty catalogue"
        case .missingReferences: "Missing linked records"
        }
    }
}

/// Creates three independently identified plans; history grouping never claims they were visited.
internal func tripsBrowserFixture(_ scenario: TripsBrowserScenario = .default) -> TripsBrowserState
{
    if scenario == .empty { return .init(trips: [], selectedTripID: "") }
    var brazil = tripsBrowserBrazilFixture()
    if scenario == .missingReferences {
        brazil.route.append(.visit("missing-visit"))
        brazil.route.append(.transport("missing-journey"))
        brazil.visits.append(
            .init(
                id: "missing-links", name: "Unresolved visit", placeID: "missing-place",
                timing: .unknown, sourceIDs: ["missing-stay"], contactIDs: ["missing-person"]))
        brazil.documents.append(
            .init(
                id: "missing-document-links", title: "Unresolved confirmation",
                fileName: "confirmation.pdf", mimeType: "application/pdf",
                sourceIDs: ["missing-stay"], visitIDs: ["missing-visit"]))
    }
    return .init(
        trips: [brazil, tripsBrowserFutureFixture(), tripsBrowserHistoryFixture()],
        selectedTripID: brazil.id)
}

private func tripsBrowserFutureFixture() -> TripsBrowserTrip {
    var today = tripsTodayFixture(.empty)
    today.displayZone = "Asia/Tokyo"
    return .init(
        id: "japan-plan", name: "Japan possibilities", when: "Summer options", today: today,
        visits: [
            .init(
                id: "kyoto-visit", name: "Kyoto", placeID: "kyoto",
                timing: .dates(from: "2028-07-10", to: "2028-07-20"))
        ],
        route: [.visit("kyoto-visit")], places: [.init(id: "kyoto", name: "Kyoto")],
        ideas: [
            .init(
                id: "kyoto-walk", title: "Evening walk", placeID: "kyoto",
                notes: "Save for planning.")
        ])
}

private func tripsBrowserHistoryFixture() -> TripsBrowserTrip {
    let today = tripsTodayFixture(.empty)
    return .init(
        id: "portugal-plan", name: "Portugal notes", when: "Spring plan", today: today,
        visits: [
            .init(
                id: "lisbon-visit", name: "Lisboa", placeID: "lisbon",
                timing: .dates(from: "2026-04-10", to: "2026-04-20"))
        ],
        route: [.visit("lisbon-visit")], places: [.init(id: "lisbon", name: "Lisboa")],
        contacts: [
            .init(
                id: "marina-old", name: "Marina Duarte", kind: .person,
                methods: [.init(id: "email", label: "Email", value: "marina.old@example.test")],
                notes: "Contact saved with this plan.")
        ],
        documents: [
            .init(
                id: "old-plan", title: "Lisboa itinerary", fileName: "itinerary.pdf",
                mimeType: "application/pdf", visitIDs: ["lisbon-visit"], notes: "Saved plan.")
        ],
        ideas: [
            .init(
                id: "lisbon-coffee", title: "Café by the square", placeID: "lisbon",
                notes: "Possibility recorded in the old plan.")
        ])
}
