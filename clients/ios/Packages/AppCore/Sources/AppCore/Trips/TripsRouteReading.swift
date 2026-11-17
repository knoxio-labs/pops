/// Canonical route reads are independent of source-detail reads and never infer a mixed order from source arrays.
public protocol TripsRouteReading: Sendable {
    /// Returns nil only for an explicitly missing producer route; unavailable or malformed reads throw.
    /// The route and a separately read TripSnapshot do not share an atomic snapshot guarantee.
    func route(tripId: Int) async throws -> TripRouteSnapshot?
}

/// The producer's authoritative mixed route, ordered paths and explicit missing-source references.
public struct TripRouteSnapshot: Codable, Hashable, Sendable {
    public let tripId: Int
    public let revision: Int
    public let order: [TripRouteItem]
    public let paths: [TripRoutePath]
    public let missingSources: [TripRouteSource]

    /// Retains exact root placement and applied history; missing sources are not silently removed.
    public init(
        tripId: Int, revision: Int, order: [TripRouteItem], paths: [TripRoutePath],
        missingSources: [TripRouteSource]
    ) {
        self.tripId = tripId
        self.revision = revision
        self.order = order
        self.paths = paths
        self.missingSources = missingSources
    }

    private enum CodingKeys: String, CodingKey {
        case tripId, revision, order, paths, missingSources
    }

    /// Rejects malformed ownership identities, duplicate active placement and orphan missing references.
    public init(from decoder: any Decoder) throws {
        let value = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            tripId: try value.decode(Int.self, forKey: .tripId),
            revision: try value.decode(Int.self, forKey: .revision),
            order: try value.decode([TripRouteItem].self, forKey: .order),
            paths: try value.decode([TripRoutePath].self, forKey: .paths),
            missingSources: try value.decode([TripRouteSource].self, forKey: .missingSources))
        guard hasValidMembership else {
            throw DecodingError.dataCorrupted(
                .init(
                    codingPath: decoder.codingPath,
                    debugDescription: "Invalid canonical route membership"))
        }
    }
}
