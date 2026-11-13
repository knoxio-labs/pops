import AppCore

internal struct TripSourceDetailFact: Equatable {
    internal let label: String
    internal let value: String

    internal init?(_ label: String, _ value: String?) {
        guard let value, !value.isEmpty else { return nil }
        self.label = label
        self.value = value
    }
}

internal struct TripSourceDetailReferenceGroup: Equatable {
    internal let title: String
    internal let links: [TripSourceLink]
}

internal struct TripSourceDetailTiming: Equatable {
    internal let label: String
    internal let day: String?
    internal let clock: String?
    internal let zone: String?

    internal var hasUnresolvedClock: Bool {
        guard let clock, !clock.isEmpty else { return false }
        guard let day else { return true }
        return TripClock.instant(local: "\(day)T\(clock)", zone: zone) == nil
    }
}

internal struct TripSourceDetailPresentation {
    internal let kind: String
    internal let states: [TripSourceDetailFact]
    internal let timings: [TripSourceDetailTiming]
    internal let facts: [TripSourceDetailFact]
    internal let references: [TripSourceDetailReferenceGroup]

    internal init(source: TripSource) {
        switch source {
        case .stay(let stay): self.init(stay: stay)
        case .journey(let journey): self.init(journey: journey)
        case .event(let event): self.init(event: event)
        }
    }
}

extension TripSourceDetailPresentation {
    private init(stay: TripStay) {
        kind = "Stay"
        states = [
            TripSourceDetailFact("Kind", stay.kind),
            TripSourceDetailFact("Booking state", stay.status),
        ].compactMap { $0 }
        timings = [
            .init(
                label: "Check-in", day: stay.timing.arrival,
                clock: stay.timing.checkIn, zone: stay.timing.timeZone),
            .init(
                label: "Check-out", day: stay.timing.departure,
                clock: stay.timing.checkOut, zone: stay.timing.timeZone),
        ]
        facts = [
            TripSourceDetailFact("Reference", stay.reference),
            TripSourceDetailFact("Address", stay.address),
            TripSourceDetailFact("Notes", stay.notes),
        ].compactMap { $0 }
        references = [
            TripSourceDetailReferenceGroup(title: "Source", links: stay.sourceLinks),
            .init(title: "Host references", links: stay.hostLinks),
            .init(title: "Document references", links: stay.documentLinks),
        ].filter { !$0.links.isEmpty }
    }

    private init(journey: TripJourney) {
        kind = "Journey"
        states = []
        timings = []
        facts = [
            TripSourceDetailFact("Reference", journey.reference),
            TripSourceDetailFact("Notes", journey.notes),
        ].compactMap { $0 }
        references =
            journey.sourceLinks.isEmpty
            ? [] : [.init(title: "Source", links: journey.sourceLinks)]
    }

    private init(event: TripEvent) {
        kind = "Event"
        states = [
            TripSourceDetailFact("Intention", event.intention),
            TripSourceDetailFact("Arrangement", event.arrangement),
            TripSourceDetailFact("Purchase", event.purchase),
        ].compactMap { $0 }
        timings = [
            .init(
                label: "Start", day: event.timing.start,
                clock: event.timing.startTime, zone: event.timing.timeZone),
            .init(
                label: "End", day: event.timing.end,
                clock: event.timing.endTime, zone: event.timing.timeZone),
        ]
        facts = [
            TripSourceDetailFact("Reference", event.reference),
            TripSourceDetailFact("Address", event.address),
            TripSourceDetailFact("Source URL", event.sourceUrl),
            TripSourceDetailFact("Ticket URL", event.ticketUrl),
            TripSourceDetailFact("Notes", event.notes),
        ].compactMap { $0 }
        references = [
            TripSourceDetailReferenceGroup(title: "Source", links: event.sourceLinks),
            .init(title: "Venue references", links: event.venueLinks),
            .init(title: "Organiser references", links: event.organiserLinks),
            .init(title: "Document references", links: event.documentLinks),
        ].filter { !$0.links.isEmpty }
    }
}

internal struct TripSourceDetailLegPresentation {
    internal let facts: [TripSourceDetailFact]
    internal let references: [TripSourceDetailReferenceGroup]

    internal init(leg: TripJourneyLeg) {
        facts = [
            TripSourceDetailFact("Mode", leg.mode),
            TripSourceDetailFact("Reference", leg.reference),
            TripSourceDetailFact("Notes", leg.notes),
        ].compactMap { $0 }
        references = [
            TripSourceDetailReferenceGroup(title: "Leg source", links: leg.sourceLinks),
            .init(title: "Departure references", links: leg.from.sourceLinks ?? []),
            .init(title: "Arrival references", links: leg.to.sourceLinks ?? []),
        ].filter { !$0.links.isEmpty }
    }
}
