/// A canonical mixed-route token. A gap is a persisted insertion identity, not inferred transport or timing.
public enum TripRouteItem: Codable, Hashable, Sendable {
    case visit(Int)
    case journey(Int)
    case gap(Int)

    /// The source or gap identity within its own kind; equal numbers of different kinds remain distinct.
    public var id: Int {
        switch self {
        case .visit(let id), .journey(let id), .gap(let id): id
        }
    }

    /// The canonical source when this token is not a structural gap.
    public var source: TripRouteSource? {
        switch self {
        case .visit(let id): .visit(id)
        case .journey(let id): .journey(id)
        case .gap: nil
        }
    }

    private enum CodingKeys: String, CodingKey { case kind, id }
    private enum Kind: String, Codable { case visit, journey, gap }

    /// Decodes only the producer's three token kinds and exact JSON-safe positive identities.
    public init(from decoder: any Decoder) throws {
        let value = try decoder.container(keyedBy: CodingKeys.self)
        let id = try value.decode(Int.self, forKey: .id)
        guard TripRouteNumbers.identities.contains(id) else {
            throw DecodingError.dataCorruptedError(
                forKey: .id, in: value,
                debugDescription: "Expected a JSON-safe positive route identity")
        }
        switch try value.decode(Kind.self, forKey: .kind) {
        case .visit: self = .visit(id)
        case .journey: self = .journey(id)
        case .gap: self = .gap(id)
        }
    }

    /// Encodes the canonical discriminator and identity without derived placement facts.
    public func encode(to encoder: any Encoder) throws {
        var value = encoder.container(keyedBy: CodingKeys.self)
        let kind: Kind
        switch self {
        case .visit: kind = .visit
        case .journey: kind = .journey
        case .gap: kind = .gap
        }
        try value.encode(kind, forKey: .kind)
        try value.encode(id, forKey: .id)
    }
}
