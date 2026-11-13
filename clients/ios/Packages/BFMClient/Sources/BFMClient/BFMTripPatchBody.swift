import AppCore
import Foundation

/// The generator's supported override for MobileTripPatchInput, preserving absent versus explicit null.
internal struct BFMTripPatchBody: Codable, Hashable, Sendable {
    internal let patch: TripMetadataPatch
    /// Encodes only the explicitly selected canonical metadata changes.
    internal init(_ patch: TripMetadataPatch) { self.patch = patch }

    /// Rejects unknown fields and null values for non-nullable canonical facts.
    internal init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let keys = try decoder.container(keyedBy: FieldKey.self)
        guard keys.allKeys.allSatisfy({ CodingKeys(rawValue: $0.stringValue) != nil }) else {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Unknown Trip field"))
        }
        patch = TripMetadataPatch(
            name: try Self.field(.name, in: values),
            destination: try values.decodeIfPresent(String.self, forKey: .destination),
            when: try values.decodeIfPresent(String.self, forKey: .when),
            tagId: try Self.field(.tagId, in: values),
            parentId: try Self.field(.parentId, in: values),
            notes: try values.decodeIfPresent(String.self, forKey: .notes),
            sourceLinks: try values.decodeIfPresent([TripSourceLink].self, forKey: .sourceLinks))
        for key in [CodingKeys.destination, .when, .notes, .sourceLinks] where values.contains(key)
        {
            if try values.decodeNil(forKey: key) {
                throw DecodingError.dataCorrupted(
                    .init(
                        codingPath: values.codingPath + [key],
                        debugDescription: "Non-nullable Trip field"))
            }
        }
    }

    /// Preserves the three distinct wire states: omission, explicit null and a selected value.
    internal func encode(to encoder: any Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try Self.encode(patch.name, key: .name, into: &values)
        try values.encodeIfPresent(patch.destination, forKey: .destination)
        try values.encodeIfPresent(patch.when, forKey: .when)
        try Self.encode(patch.tagId, key: .tagId, into: &values)
        try Self.encode(patch.parentId, key: .parentId, into: &values)
        try values.encodeIfPresent(patch.notes, forKey: .notes)
        try values.encodeIfPresent(patch.sourceLinks, forKey: .sourceLinks)
    }

    private static func field<Value: Decodable & Hashable & Sendable>(
        _ key: CodingKeys, in values: KeyedDecodingContainer<CodingKeys>
    ) throws -> TripFieldUpdate<Value> {
        guard values.contains(key) else { return .unchanged }
        if try values.decodeNil(forKey: key) { return .cleared }
        return .set(try values.decode(Value.self, forKey: key))
    }

    private static func encode<Value: Encodable & Hashable & Sendable>(
        _ value: TripFieldUpdate<Value>, key: CodingKeys,
        into values: inout KeyedEncodingContainer<CodingKeys>
    ) throws {
        switch value {
        case .unchanged: break
        case .cleared: try values.encodeNil(forKey: key)
        case .set(let value): try values.encode(value, forKey: key)
        }
    }

    private struct FieldKey: CodingKey {
        let stringValue: String
        let intValue: Int? = nil
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }

    private enum CodingKeys: String, CodingKey {
        case name, destination, when, tagId, parentId, notes, sourceLinks
    }
}
