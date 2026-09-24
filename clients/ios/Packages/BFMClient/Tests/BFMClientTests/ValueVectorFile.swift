import AppCore
import Foundation

/// `clients/ios/Contracts/value-vectors-v1.json`, vendored byte for byte from
/// the inventory pillar, whose command engine wrote every value and whose sync
/// projection produced every item (POPS-4403).
///
/// Read loosely with `JSONSerialization`: the suites hand each item and
/// catalogue back to the scripted server as JSON, so what decodes them is the
/// transport's generated types, not a model written here.
internal struct ValueVectorFile {
    internal struct Missing: Error, CustomStringConvertible {
        internal let description: String
    }

    internal let liveRevision: Int
    internal let currentRevision: Int
    internal let typeId: String
    internal let catalogues: [[String: Any]]
    internal let vectors: [[String: Any]]
    internal let negatives: [[String: Any]]

    private static let relativePath = "Contracts/value-vectors-v1.json"

    /// Walks up from this file until the vendored copy appears.
    internal static func load(from sourceFile: String = #filePath) throws -> Self {
        var directory = URL(fileURLWithPath: sourceFile).deletingLastPathComponent()
        while directory.path != "/" {
            let candidate = directory.appendingPathComponent(relativePath)
            if FileManager.default.fileExists(atPath: candidate.path) {
                return try Self(
                    root: object(JSONSerialization.jsonObject(with: Data(contentsOf: candidate))))
            }
            directory.deleteLastPathComponent()
        }
        throw Missing(description: relativePath)
    }

    private init(root: [String: Any]) throws {
        liveRevision = try Self.require(root["liveRevision"] as? Int, "liveRevision")
        currentRevision = try Self.require(root["currentRevision"] as? Int, "currentRevision")
        typeId = try Self.require(root["typeId"] as? String, "typeId")
        catalogues = try Self.require(root["catalogues"] as? [[String: Any]], "catalogues")
        vectors = try Self.require(root["vectors"] as? [[String: Any]], "vectors")
        negatives = try Self.require(root["negativeVectors"] as? [[String: Any]], "negativeVectors")
    }

    internal static func require<Value>(_ value: Value?, _ what: String) throws -> Value {
        guard let value else { throw Missing(description: what) }
        return value
    }

    internal static func object(_ value: Any?) throws -> [String: Any] {
        try require(value as? [String: Any], "a JSON object")
    }

    /// `value` as JSON text, for a scripted reply or a wire value literal.
    internal static func json(_ value: Any) throws -> String {
        let data = try JSONSerialization.data(
            withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys])
        return try require(String(bytes: data, encoding: .utf8), "UTF-8 JSON")
    }

    /// The catalogue descriptor for `revision` as the BFM's type-catalogue
    /// route serves it: the pillar's, less the authoring-only `draftVersion`
    /// (`mobile-inventory-value-vectors.test.ts` pins that projection).
    internal func catalogueJSON(revision: Int) throws -> String {
        let found = try catalogues.first {
            try Self.object($0["revision"])["revision"] as? Int == revision
        }
        var catalogue = try Self.require(found, "catalogue revision \(revision)")
        var header = try Self.object(catalogue["revision"])
        header.removeValue(forKey: "draftVersion")
        catalogue["revision"] = header
        return try Self.json(catalogue)
    }

    /// The negative cases of `category`, in file order.
    internal func negatives(_ category: String) -> [[String: Any]] {
        negatives.filter { $0["category"] as? String == category }
    }

    /// The kind the `unknown_kind` case names, outside the closed vocabulary.
    internal func unknownKind() throws -> String {
        let field = try Self.object(negatives("unknown_kind").first?["field"])
        return try Self.require(field["kind"] as? String, "unknown kind")
    }

    /// The minimum protocol the `protocol_above_supported` case names.
    internal func aboveSupportedProtocol() throws -> Int {
        try Self.require(
            negatives("protocol_above_supported").first?["minimumProtocol"] as? Int,
            "minimum protocol")
    }

    /// The field descriptors of the vector type at `revision`.
    internal func fields(revision: Int) throws -> [[String: Any]] {
        let catalogue = try Self.require(
            try catalogues.first {
                try Self.object($0["revision"])["revision"] as? Int == revision
            },
            "catalogue revision \(revision)")
        let types = try Self.require(catalogue["types"] as? [[String: Any]], "types")
        let type = try Self.require(
            types.first { $0["id"] as? String == typeId }, "the vector type")
        return try Self.require(type["fields"] as? [[String: Any]], "fields")
    }
}
