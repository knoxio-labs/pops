import Foundation

internal enum CanonicalKey: String, CodingKey {
    case text
    case value
}

/// Reads a canonical wrapper through its validating initialiser, so a
/// stored spelling that is not canonical fails to decode instead of
/// bypassing the check.
internal func decodeCanonical<Raw: Decodable, Value>(
    _ raw: Raw.Type, key: CanonicalKey, from decoder: any Decoder,
    _ make: (Raw) throws -> Value
) throws -> Value {
    let container = try decoder.container(keyedBy: CanonicalKey.self)
    let rawValue = try container.decode(Raw.self, forKey: key)
    do {
        return try make(rawValue)
    } catch {
        throw DecodingError.dataCorruptedError(
            forKey: key, in: container, debugDescription: "\(rawValue) is not canonical")
    }
}
