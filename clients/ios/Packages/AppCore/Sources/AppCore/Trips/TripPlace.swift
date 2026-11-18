/// A reusable trip place with geographic coordinates only after an explicit selection.
public struct TripPlace: Codable, Hashable, Sendable, Identifiable {
    public let id: Int
    public let name: String
    public let pin: TripPlacePin?
    public let sourceLinks: [TripSourceLink]

    /// Creates the value from explicit source fields without deriving optional facts.
    public init(
        id: Int,
        name: String,
        pin: TripPlacePin? = nil,
        sourceLinks: [TripSourceLink]
    ) {
        self.id = id
        self.name = name
        self.pin = pin
        self.sourceLinks = sourceLinks
    }
}

/// A complete explicitly selected WGS84 point in decimal degrees.
public struct TripPlacePin: Codable, Hashable, Sendable {
    public let latitude: Double
    public let longitude: Double

    /// Creates a point only when both finite coordinates are within geographic bounds.
    public init(latitude: Double, longitude: Double) throws {
        guard latitude.isFinite, (-90...90).contains(latitude),
            longitude.isFinite, (-180...180).contains(longitude)
        else { throw TripPlacePinError.invalidCoordinates }
        self.latitude = latitude
        self.longitude = longitude
    }

    private enum CodingKeys: String, CodingKey { case latitude, longitude }

    /// Decodes only complete, finite coordinates within geographic bounds.
    public init(from decoder: any Decoder) throws {
        let value = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            latitude: value.decode(Double.self, forKey: .latitude),
            longitude: value.decode(Double.self, forKey: .longitude))
    }
}

/// Rejects incomplete, non-finite or out-of-range selected map points.
public enum TripPlacePinError: Error, Equatable, Sendable {
    case invalidCoordinates
}
