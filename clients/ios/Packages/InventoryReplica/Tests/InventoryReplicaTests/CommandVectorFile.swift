import Foundation

/// A JSON value, for reading the command vectors' free-form `args`.
internal enum JSONValue: Decodable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let number = try? container.decode(Double.self) {
            self = .number(number)
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let array = try? container.decode([JSONValue].self) {
            self = .array(array)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    subscript(key: String) -> JSONValue? {
        guard case .object(let object) = self else { return nil }
        return object[key]
    }

    var string: String? {
        guard case .string(let value) = self else { return nil }
        return value
    }

    var int: Int? {
        guard case .number(let value) = self else { return nil }
        return Int(exactly: value)
    }

    /// Whether this is JSON `true`; anything else, `false` included, is not.
    var isTrue: Bool { self == .bool(true) }

    /// Whether this is a JSON boolean at all.
    var isBool: Bool {
        if case .bool = self { return true }
        return false
    }
}

/// `clients/ios/Contracts/command-vectors-v1.json`, vendored byte for byte
/// from `pillars/inventory/contracts/command-vectors-v1.json`, which the
/// server's own command tests generate.
internal struct CommandVectorFile: Decodable {
    struct Placement: Decodable {
        let kind: String
        let locationId: String?
        let itemId: String?
    }

    struct SeedItem: Decodable {
        let id: String
        let name: String
        let placement: Placement
        let isContainer: JSONValue?
        let access: String?
        let quantity: Int?
        let code: String?
        let typeKey: String?
        let deletedAt: String?
    }

    struct SeedLocation: Decodable {
        let id: String
        let name: String
        let parentId: String?
    }

    struct Mutation: Decodable {
        let mutationId: String
        let op: String
        let entityId: String
        let baseRevision: Int?
        let dependsOn: [String]
        let args: JSONValue
        let clientTime: String
    }

    struct Outcome: Decodable {
        let mutationId: String
        let status: String
        let revision: Int?
        let seq: Int?
    }

    struct Vector: Decodable {
        let name: String
        let op: String
        let seedLocations: [SeedLocation]
        let seedItems: [SeedItem]
        let mutation: Mutation
        let outcome: Outcome
    }

    let version: Int
    let vectors: [Vector]

    static let relativePath = "Contracts/command-vectors-v1.json"

    /// Walks up from this file until the vendored copy appears, rather than
    /// counting directory levels.
    static func load(from sourceFile: String = #filePath) throws -> CommandVectorFile {
        var directory = URL(fileURLWithPath: sourceFile).deletingLastPathComponent()
        while directory.path != "/" {
            let candidate = directory.appendingPathComponent(relativePath)
            if FileManager.default.fileExists(atPath: candidate.path) {
                return try JSONDecoder().decode(Self.self, from: Data(contentsOf: candidate))
            }
            directory.deleteLastPathComponent()
        }
        throw CocoaError(.fileNoSuchFile)
    }
}
