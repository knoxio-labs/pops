/// The source category is explicit and suitable for presentation metadata such as an icon.
internal enum TripsTodayKind: String, Sendable {
    case stay, journey, event
}

/// An unchanged source value shared by both layouts and the selected-source inspector.
internal enum TripsTodaySource: Equatable, Sendable, Identifiable {
    case stay(TripsTodayStay)
    case journey(TripsTodayJourney)
    case event(TripsTodayEvent)

    /// The original stable identity, without merging equal source names.
    internal var id: String {
        switch self {
        case .stay(let value): value.id
        case .journey(let value): value.id
        case .event(let value): value.id
        }
    }

    /// The source's own display name.
    internal var name: String {
        switch self {
        case .stay(let value): value.name
        case .journey(let value): value.name
        case .event(let value): value.name
        }
    }

    /// Purchase alone denotes a hard commitment; agreement does not imply purchase.
    internal var purchased: Bool {
        switch self {
        case .stay(let value): value.purchased
        case .journey(let value): value.purchased
        case .event(let value): value.purchased
        }
    }

    /// Operational details from this exact source, without enrichment or inference.
    internal var essentials: TripsTodayEssentials {
        switch self {
        case .stay(let value): value.essentials
        case .journey(let value): value.essentials
        case .event(let value): value.essentials
        }
    }

    /// Explicit source category, independent of labels or identifiers.
    internal var kind: TripsTodayKind {
        switch self {
        case .stay: .stay
        case .journey: .journey
        case .event: .event
        }
    }
}

/// A real endpoint or day continuation; continuing entries never fabricate a clock.
internal enum TripsTodayBoundary: String, Sendable {
    case start, end, continuing
}

/// A boundary occurring on the display day, or an explicitly recorded date-only commitment.
internal struct TripsTodayCommitment: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var source: TripsTodaySource
    internal var boundary: TripsTodayBoundary
    internal var clock: TripsTodayClock?
    internal var day: String
    internal var legID: String?
}

/// A source issue retains identities so the corresponding original can be inspected.
internal struct TripsTodayFinding: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var message: String
    internal var sourceIDs: [String]
}

/// Both layouts use exactly sources; commitments describe only the explicit display day.
internal struct TripsTodayProjection: Equatable, Sendable {
    internal var day: String?
    internal var currentStays: [TripsTodayStay]
    internal var nextJourney: TripsTodayJourney?
    internal var commitments: [TripsTodayCommitment]
    internal var sources: [TripsTodaySource]
    internal var findings: [TripsTodayFinding]
}

/// Looks up the actual source identity, returning nil for a missing reference.
internal func tripsTodaySource(_ state: TripsTodayState, id: String) -> TripsTodaySource? {
    let sources =
        state.stays.map(TripsTodaySource.stay)
        + state.journeys.map(TripsTodaySource.journey)
        + state.events.map(TripsTodaySource.event)
    return sources.first { $0.id == id }
}
