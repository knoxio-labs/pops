/// Named fictional snapshots exercise the same source contracts without reading a live clock.
internal enum TripsTodayScenario: String, CaseIterable, Sendable {
    case `default`, travelDay, quiet, empty, unavailable, unknownTimes, outbound, overlapping

    /// Human-readable fixture name used by the playground's state selector.
    internal var title: String {
        switch self {
        case .default: "Today in Olinda"
        case .travelDay: "Travel day"
        case .quiet: "Quiet day"
        case .empty: "Empty trip"
        case .unavailable: "Document unavailable"
        case .unknownTimes: "Unknown timing"
        case .outbound: "Across time zones"
        case .overlapping: "Overlapping stays"
        }
    }
}

/// Returns independently editable fictional source values, with an explicit reference instant.
internal func tripsTodayFixture(_ scenario: TripsTodayScenario = .default) -> TripsTodayState {
    let state = TripsTodayState(
        now: "2027-12-29T15:00:00-03:00", displayZone: "America/Recife",
        stays: tripsTodayFixtureStays(), journeys: tripsTodayFixtureJourneys(),
        events: tripsTodayFixtureEvents(),
        lodgingWindows: [
            .init(
                id: "olinda-window", name: "Olinda visit",
                from: tripsTodayFixtureClock("2027-12-29T14:00:00-03:00", "America/Recife"),
                to: tripsTodayFixtureClock("2028-01-05T11:00:00-03:00", "America/Recife"))
        ])
    return tripsTodayFixtureScenario(state, scenario: scenario)
}

private func tripsTodayFixtureScenario(
    _ original: TripsTodayState, scenario: TripsTodayScenario
) -> TripsTodayState {
    var state = original
    switch scenario {
    case .default: break
    case .travelDay: state.now = "2027-12-29T00:00:00-03:00"
    case .quiet: state.now = "2027-12-31T15:00:00-03:00"
    case .empty:
        state.stays = []
        state.journeys = []
        state.events = []
        state.lodgingWindows = []
    case .unavailable:
        state.stays = state.stays.map { stay in
            var updated = stay
            updated.essentials.documents = stay.essentials.documents.map { document in
                var unavailable = document
                unavailable.availability = .unavailable
                return unavailable
            }
            return updated
        }
    case .unknownTimes: state = tripsTodayUnknownFixture(state)
    case .outbound:
        state.now = "2027-11-24T09:00:00+11:00"
        state.displayZone = "Australia/Sydney"
    case .overlapping:
        if var stay = state.stays.first {
            stay.id = "overlapping-stay"
            stay.name = "Recife apartment"
            stay.purchased = false
            state.stays.append(stay)
        }
    }
    return state
}

/// Creates one explicit fictional source clock without interpreting its local text.
internal func tripsTodayFixtureClock(_ at: String, _ timeZone: String) -> TripsTodayClock {
    .init(at: at, timeZone: timeZone)
}

private func tripsTodayUnknownFixture(_ original: TripsTodayState) -> TripsTodayState {
    var state = original
    state.stays = state.stays.map { stay in
        var updated = stay
        updated.from = nil
        return updated
    }
    state.journeys = [
        .init(
            id: "undated-journey", name: "Recife to Florianópolis",
            legs: [
                .init(id: "undated-leg", name: "REC → FLN", departure: nil, arrival: nil)
            ], essentials: .init(), purchased: false)
    ]
    state.events.append(
        .init(
            id: "undated-meeting", name: "Coffee with Marina", start: nil,
            end: nil, day: nil, agreement: "Considering", essentials: .init(),
            purchased: false))
    return state
}
