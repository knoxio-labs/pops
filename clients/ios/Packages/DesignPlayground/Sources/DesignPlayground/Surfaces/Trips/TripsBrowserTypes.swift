/// Derived date grouping; history records past plans, not proof that travel happened.
internal enum TripsBrowserPeriod: String, CaseIterable, Sendable {
    case current, future, history, other

    /// Trip selector section title from the explicit grouping.
    internal var title: String {
        switch self {
        case .current: "Current"
        case .future: "Future"
        case .history: "History"
        case .other: "Other"
        }
    }
}

/// A recorded location, independently identified from its name or repeated visits.
internal struct TripsBrowserPlace: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
}

/// Contact source category, without guessing from a name or method.
internal enum TripsBrowserContactKind: String, Sendable {
    case person, business, organisation
}

/// A labelled contact fact whose value is kept verbatim.
internal struct TripsBrowserContactFact: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var label: String
    internal var value: String
}

/// A person or business with explicit arrangement associations and original contact facts.
internal struct TripsBrowserContact: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
    internal var kind: TripsBrowserContactKind
    internal var methods: [TripsBrowserContactFact] = []
    internal var addresses: [TripsBrowserContactFact] = []
    internal var notes: String = ""
    internal var sourceIDs: [String] = []
}

/// Source visit precision stays explicit; month and unknown timing never become exact day bounds.
internal enum TripsBrowserVisitTiming: Equatable, Sendable {
    case dates(from: String?, to: String?)
    case month(String)
    case unknown
}

/// One visit identity with explicit location, timing precision and source associations.
internal struct TripsBrowserVisit: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
    internal var placeID: String
    internal var timing: TripsBrowserVisitTiming
    internal var sourceIDs: [String] = []
    internal var contactIDs: [String] = []
}

/// Linked original metadata only; no file handle, offline-ready or download state is implied.
internal struct TripsBrowserDocument: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var title: String
    internal var fileName: String
    internal var mimeType: String
    internal var sourceIDs: [String] = []
    internal var visitIDs: [String] = []
    internal var notes: String = ""
}

/// A saved possibility with an optional explicit source location, independent of the route.
internal struct TripsBrowserIdea: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var title: String
    internal var placeID: String?
    internal var notes: String
}

/// An explicitly recorded transport gap between two visit identities.
internal struct TripsBrowserGap: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var fromVisitID: String
    internal var toVisitID: String
}

/// Explicit alternatives retain their own identity and original arrangement references.
internal struct TripsBrowserAlternative: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var title: String
    internal var detail: String
    internal var sourceIDs: [String]
}

/// Route sequence is authoritative and does not reorder itself from source dates.
internal enum TripsBrowserRouteEntry: Equatable, Sendable {
    case visit(String)
    case transport(String)
    case gap(TripsBrowserGap)
    case alternative(TripsBrowserAlternative)
}

/// A fictional trip snapshot reusing Today clocks and sources rather than a second booking schema.
internal struct TripsBrowserTrip: Equatable, Sendable, Identifiable {
    internal var id: String
    internal var name: String
    internal var when: String
    internal var today: TripsTodayState
    internal var visits: [TripsBrowserVisit] = []
    internal var route: [TripsBrowserRouteEntry] = []
    internal var places: [TripsBrowserPlace] = []
    internal var contacts: [TripsBrowserContact] = []
    internal var documents: [TripsBrowserDocument] = []
    internal var ideas: [TripsBrowserIdea] = []
}

/// Local trip catalogue and explicit selection; missing selection has no fallback identity.
internal struct TripsBrowserState: Equatable, Sendable {
    internal var trips: [TripsBrowserTrip]
    internal var selectedTripID: String
}

/// Resolves the selected trip without substituting another current or first record.
internal func tripsBrowserSelectedTrip(_ state: TripsBrowserState) -> TripsBrowserTrip? {
    state.trips.first { $0.id == state.selectedTripID }
}
