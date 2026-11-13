/// One explicitly selected change to a nullable Trip fact.
/// It is not inferred from an optional value or a display label.
public enum TripFieldUpdate<Value: Hashable & Sendable>: Hashable, Sendable {
    case unchanged
    case set(Value)
    case cleared
}

/// Fieldwise canonical Trip metadata. Unselected fields remain untouched;
/// empty text and empty source links are explicit values.
public struct TripMetadataPatch: Hashable, Sendable {
    public var name: TripFieldUpdate<String>
    public var destination: String?
    public var when: String?
    public var tagId: TripFieldUpdate<String>
    public var parentId: TripFieldUpdate<Int>
    public var notes: String?
    public var sourceLinks: [TripSourceLink]?

    /// Creates a patch without deriving timing, hierarchy or source references from another field.
    public init(
        name: TripFieldUpdate<String> = .unchanged, destination: String? = nil, when: String? = nil,
        tagId: TripFieldUpdate<String> = .unchanged, parentId: TripFieldUpdate<Int> = .unchanged,
        notes: String? = nil, sourceLinks: [TripSourceLink]? = nil
    ) {
        self.name = name
        self.destination = destination
        self.when = when
        self.tagId = tagId
        self.parentId = parentId
        self.notes = notes
        self.sourceLinks = sourceLinks
    }
}

/// Fieldwise metadata writes through the paired device's owning Trip service; no method creates a Trip.
public protocol TripMetadataWriting: Sendable {
    /// Returns nil only for the owner's explicit missing-Trip response. Unknown outcomes throw and never replay.
    func updateTrip(id: Int, patch: TripMetadataPatch) async throws -> TripRecord?
}
