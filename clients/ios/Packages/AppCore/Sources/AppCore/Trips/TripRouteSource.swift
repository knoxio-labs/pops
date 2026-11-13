/// A canonical Visit or Journey reference; missing records retain this identity without becoming gaps.
public enum TripRouteSource: Codable, Hashable, Sendable {
    case visit(Int)
    case journey(Int)

    /// The matching root token, preserving the source kind as well as its numeric identity.
    public var item: TripRouteItem {
        switch self {
        case .visit(let id): .visit(id)
        case .journey(let id): .journey(id)
        }
    }

    /// Decodes canonical source references and rejects structural gaps in source-only memberships.
    public init(from decoder: any Decoder) throws {
        let item = try TripRouteItem(from: decoder)
        guard let source = item.source else {
            throw DecodingError.dataCorrupted(
                .init(
                    codingPath: decoder.codingPath, debugDescription: "A gap is not a route source")
            )
        }
        self = source
    }

    /// Encodes the same source discriminator used by the root route.
    public func encode(to encoder: any Encoder) throws {
        try item.encode(to: encoder)
    }
}
