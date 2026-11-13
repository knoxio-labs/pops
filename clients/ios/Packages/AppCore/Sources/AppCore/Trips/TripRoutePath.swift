/// One ordered complete alternative, or its retained applied history; neither state implies a booking status.
public struct TripRoutePath: Codable, Hashable, Sendable, Identifiable {
    /// Whether membership is an active alternative or an immutable record of an applied path.
    public enum State: String, Codable, Hashable, Sendable {
        case alternative
        case applied
    }

    public let id: Int
    public let title: String
    public let gapId: Int
    public let state: State
    public let members: [TripRouteSource]

    /// Retains the producer's exact path identity, title, gap and member order.
    public init(id: Int, title: String, gapId: Int, state: State, members: [TripRouteSource]) {
        self.id = id
        self.title = title
        self.gapId = gapId
        self.state = state
        self.members = members
    }
}
