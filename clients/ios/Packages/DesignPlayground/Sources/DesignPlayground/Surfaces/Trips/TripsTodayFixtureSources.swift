/// Fictional accommodation sources include a deliberate hotel-switch gap.
internal func tripsTodayFixtureStays() -> [TripsTodayStay] {
    [
        .init(
            id: "carmo", name: "Pousada do Carmo",
            from: tripsTodayFixtureClock("2027-12-29T14:00:00-03:00", "America/Recife"),
            to: tripsTodayFixtureClock("2028-01-03T11:00:00-03:00", "America/Recife"),
            essentials: .init(
                reference: "DEMO-CARMO-29", address: "Rua do Amparo, Olinda",
                contact: .init(
                    name: "Reception", methodLabel: "Phone",
                    method: "+55 81 0000 0129"),
                documents: [
                    .init(
                        id: "carmo-confirmation", name: "Stay confirmation",
                        availability: .available)
                ]), purchased: true),
        .init(
            id: "recife-stay", name: "Recife hotel",
            from: tripsTodayFixtureClock("2028-01-03T14:00:00-03:00", "America/Recife"),
            to: tripsTodayFixtureClock("2028-01-05T11:00:00-03:00", "America/Recife"),
            essentials: .init(address: "Boa Viagem, Recife"), purchased: false),
    ]
}

/// Fictional source legs retain their individual offset-bearing clocks and IANA zones.
internal func tripsTodayFixtureJourneys() -> [TripsTodayJourney] {
    [
        .init(
            id: "outbound", name: "Sydney to São Paulo",
            legs: [
                .init(
                    id: "syd-dfw", name: "SYD → DFW",
                    departure: tripsTodayFixtureClock(
                        "2027-11-24T10:00:00+11:00", "Australia/Sydney"),
                    arrival: tripsTodayFixtureClock("2027-11-24T08:15:00-06:00", "America/Chicago")),
                .init(
                    id: "dfw-gru", name: "DFW → GRU",
                    departure: tripsTodayFixtureClock(
                        "2027-11-24T09:00:00-06:00", "America/Chicago"),
                    arrival: tripsTodayFixtureClock(
                        "2027-11-25T00:30:00-03:00", "America/Sao_Paulo")),
            ], essentials: .init(reference: "DEMO-SYD-GRU"), purchased: true),
        .init(
            id: "poa-rec", name: "Porto Alegre to Recife",
            legs: [
                .init(
                    id: "poa-rec-leg", name: "POA → REC",
                    departure: tripsTodayFixtureClock(
                        "2027-12-29T00:15:00-03:00", "America/Sao_Paulo"),
                    arrival: tripsTodayFixtureClock("2027-12-29T03:40:00-03:00", "America/Recife"))
            ],
            essentials: .init(
                reference: "DEMO-POA-REC",
                documents: [
                    .init(id: "poa-ticket", name: "Flight ticket", availability: .unknown)
                ]), purchased: true),
        tripsTodayReturnFixture(),
    ]
}

/// Fictional commitments distinguish purchase, agreement and explicit date-only intention.
internal func tripsTodayFixtureEvents() -> [TripsTodayEvent] {
    [
        .init(
            id: "dinner", name: "Dinner in Porto Alegre",
            start: tripsTodayFixtureClock("2027-12-28T21:00:00-03:00", "America/Sao_Paulo"),
            end: tripsTodayFixtureClock("2027-12-28T22:30:00-03:00", "America/Sao_Paulo"),
            agreement: "Agreed", essentials: .init(), purchased: false),
        .init(
            id: "marina-coffee", name: "Coffee with Marina", day: "2027-12-29",
            agreement: "Considering",
            essentials: .init(
                contact: .init(
                    name: "Marina Duarte", methodLabel: "Email", method: "marina@example.test")),
            purchased: false),
        .init(
            id: "concert", name: "Recife concert",
            start: tripsTodayFixtureClock("2028-01-02T20:00:00-03:00", "America/Recife"),
            end: tripsTodayFixtureClock("2028-01-02T23:00:00-03:00", "America/Recife"),
            essentials: .init(documents: [
                .init(
                    id: "concert-ticket", name: "Concert ticket",
                    availability: .available)
            ]), purchased: true),
    ]
}

private func tripsTodayReturnFixture() -> TripsTodayJourney {
    .init(
        id: "return", name: "Florianópolis to Sydney",
        legs: [
            .init(
                id: "fln-syd", name: "FLN → SYD",
                departure: tripsTodayFixtureClock(
                    "2028-02-25T17:00:00-03:00", "America/Sao_Paulo"),
                arrival: tripsTodayFixtureClock("2028-02-27T06:00:00+11:00", "Australia/Sydney")
            )
        ], essentials: .init(), purchased: false)
}
