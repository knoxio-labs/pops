/// An explicit source instant and its recorded IANA time zone; neither replaces the other.
internal struct TripsTodayClock: Equatable, Sendable {
    internal var at: String
    internal var timeZone: String
}

/// Contact details supplied by the selected source, without inferred method semantics.
internal struct TripsTodayContact: Equatable, Sendable {
    internal var name: String
    internal var methodLabel: String
    internal var method: String
}

/// Recorded source availability, not a claim that this app has downloaded a file.
internal enum TripsTodayDocumentAvailability: String, Sendable {
    case available, unavailable, unknown
}

/// A fictional document reference with explicit source availability.
internal struct TripsTodayDocument: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
    internal var availability: TripsTodayDocumentAvailability
}

/// Optional operational details are present only when supplied by the source.
internal struct TripsTodayEssentials: Equatable, Sendable {
    internal var reference: String?
    internal var address: String?
    internal var contact: TripsTodayContact?
    internal var documents: [TripsTodayDocument] = []
}

/// Accommodation bounds are precise source clocks when known; purchase is independent of timing.
internal struct TripsTodayStay: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
    internal var from: TripsTodayClock?
    internal var to: TripsTodayClock?
    internal var essentials: TripsTodayEssentials
    internal var purchased: Bool
}

/// A journey segment retains both endpoint zones and never substitutes another leg's clock.
internal struct TripsTodayLeg: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
    internal var departure: TripsTodayClock?
    internal var arrival: TripsTodayClock?
}

/// The ordered source legs of one journey, independently marked purchased or planned.
internal struct TripsTodayJourney: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
    internal var legs: [TripsTodayLeg]
    internal var essentials: TripsTodayEssentials
    internal var purchased: Bool
}

/// A commitment can have precise clocks or an explicitly recorded date-only day.
internal struct TripsTodayEvent: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
    internal var start: TripsTodayClock?
    internal var end: TripsTodayClock?
    internal var day: String?
    internal var agreement: String?
    internal var essentials: TripsTodayEssentials
    internal var purchased: Bool
}

/// A declared accommodation requirement; unknown or invalid bounds cannot establish a gap.
internal struct TripsTodayLodgingWindow: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
    internal var from: TripsTodayClock?
    internal var to: TripsTodayClock?
}

/// A deterministic fictional snapshot; projection never reads the device's current clock.
internal struct TripsTodayState: Equatable, Sendable {
    internal var now: String
    internal var displayZone: String
    internal var stays: [TripsTodayStay]
    internal var journeys: [TripsTodayJourney]
    internal var events: [TripsTodayEvent]
    internal var lodgingWindows: [TripsTodayLodgingWindow] = []
}
