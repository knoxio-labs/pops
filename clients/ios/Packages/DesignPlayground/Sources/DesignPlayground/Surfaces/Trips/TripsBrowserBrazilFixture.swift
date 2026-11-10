/// Fictional Brazil route explicitly associates visits, journeys, gaps and alternatives.
internal func tripsBrowserBrazilFixture() -> TripsBrowserTrip {
    var today = tripsTodayFixture()
    today.stays.append(
        .init(
            id: "olinda-switch", name: "Olinda guesthouse",
            from: .init(at: "2028-01-03T14:00:00-03:00", timeZone: "America/Recife"),
            to: .init(at: "2028-01-05T11:00:00-03:00", timeZone: "America/Recife"),
            essentials: .init(address: "Rua de São Bento, Olinda"), purchased: false))
    return .init(
        id: "brazil-plan", name: "Brasil 2027–28", when: "Christmas and summer", today: today,
        visits: tripsBrowserBrazilVisits(),
        route: [
            .visit("sydney-out"), .transport("outbound"), .visit("sao-paulo-visit"),
            .gap(.init(id: "sao-poa-gap", fromVisitID: "sao-paulo-visit", toVisitID: "poa-visit")),
            .visit("poa-visit"), .transport("poa-rec"), .visit("olinda-visit"),
            .alternative(
                .init(
                    id: "recife-option", title: "Recife hotel option", detail: "",
                    sourceIDs: ["recife-stay"])),
            .visit("florianopolis-visit"), .transport("return"), .visit("sydney-home"),
        ],
        places: [
            .init(id: "sydney", name: "Sydney"), .init(id: "sao-paulo", name: "São Paulo"),
            .init(id: "poa", name: "Porto Alegre"), .init(id: "olinda", name: "Olinda"),
            .init(id: "recife", name: "Recife"), .init(id: "florianopolis", name: "Florianópolis"),
        ], contacts: tripsBrowserBrazilContacts(), documents: tripsBrowserBrazilDocuments(),
        ideas: [
            .init(
                id: "amparo-walk", title: "Walk around Amparo", placeID: "olinda",
                notes: "Marina recommended the neighbourhood."),
            .init(
                id: "recife-museum", title: "Museum possibility", placeID: "recife",
                notes: "No day selected."),
        ])
}

private func tripsBrowserBrazilVisits() -> [TripsBrowserVisit] {
    [
        .init(
            id: "sydney-out", name: "Sydney", placeID: "sydney",
            timing: .dates(from: "2027-11-24", to: "2027-11-24")),
        .init(
            id: "sao-paulo-visit", name: "São Paulo", placeID: "sao-paulo",
            timing: .dates(from: "2027-11-25", to: nil)),
        .init(
            id: "poa-visit", name: "Porto Alegre", placeID: "poa",
            timing: .dates(from: nil, to: "2027-12-29"), sourceIDs: ["dinner"]),
        .init(
            id: "olinda-visit", name: "Olinda", placeID: "olinda",
            timing: .dates(from: "2027-12-29", to: "2028-01-05"),
            sourceIDs: ["carmo", "olinda-switch", "concert", "marina-coffee"],
            contactIDs: ["marina", "carmo-contact"]),
        .init(
            id: "florianopolis-visit", name: "Florianópolis", placeID: "florianopolis",
            timing: .month("2028-02")),
        .init(
            id: "sydney-home", name: "Sydney", placeID: "sydney",
            timing: .dates(from: "2028-02-27", to: "2028-02-27")),
    ]
}
