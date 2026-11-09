/// An explicit external or pillar reference; it does not establish offline file availability.
public struct TripSourceLink: Codable, Hashable, Sendable {
    public let uri: String
    public let label: String?

    /// Retains the supplied source values without filling absent components.
    public init(uri: String, label: String?) {
        self.uri = uri
        self.label = label
    }
}
