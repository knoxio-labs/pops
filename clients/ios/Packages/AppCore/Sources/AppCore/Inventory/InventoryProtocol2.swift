import Foundation

/// Lossless JSON used for catalogue presentation hints and expression ASTs.
public indirect enum InventoryJSON: Codable, Hashable, Sendable {
    case null
    case boolean(Bool)
    case number(String)
    case string(String)
    case array([InventoryJSON])
    case object([String: InventoryJSON])
}

/// Why a protocol-2 primitive could not be represented canonically.
public enum InventoryCanonicalValueError: Error, Hashable, Sendable {
    case integer
    case decimal
    case date
    case dateTime
    case url
}

/// JSON-safe integer accepted by inventory protocol 2.
public struct InventoryInteger: Codable, Hashable, Sendable {
    public let value: Int64

    /// Refuses integers that a JSON number cannot preserve exactly across the TypeScript server.
    public init(_ value: Int64) throws {
        guard (-9_007_199_254_740_991...9_007_199_254_740_991).contains(value) else {
            throw InventoryCanonicalValueError.integer
        }
        self.value = value
    }
}

/// Canonical decimal text, preserved without a binary floating-point conversion.
public struct InventoryDecimal: Codable, Hashable, Sendable {
    public let text: String

    /// Validates the server's decimal grammar and precision bounds.
    public init(_ text: String) throws {
        let pattern = #"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$"#
        guard text.range(of: pattern, options: .regularExpression) != nil,
            text != "-0", text.range(of: #"^-0\.0+$"#, options: .regularExpression) == nil
        else { throw InventoryCanonicalValueError.decimal }
        let unsigned = text.first == "-" ? String(text.dropFirst()) : text
        let parts = unsigned.split(separator: ".", omittingEmptySubsequences: false)
        let significant = parts.joined().drop(while: { $0 == "0" }).count
        let fraction = parts.count == 2 ? parts[1].count : 0
        guard significant <= 18, fraction <= 9 else {
            throw InventoryCanonicalValueError.decimal
        }
        self.text = text
    }
}

/// Canonical Gregorian calendar date in `YYYY-MM-DD` form.
public struct InventoryCanonicalDate: Codable, Hashable, Sendable {
    public let text: String

    /// Validates both the wire spelling and the represented calendar day.
    public init(_ text: String) throws {
        let expression = try NSRegularExpression(pattern: #"^(\d{4})-(\d{2})-(\d{2})$"#)
        let range = NSRange(text.startIndex..., in: text)
        guard let match = expression.firstMatch(in: text, range: range),
            let yearRange = Range(match.range(at: 1), in: text),
            let monthRange = Range(match.range(at: 2), in: text),
            let dayRange = Range(match.range(at: 3), in: text),
            let year = Int(text[yearRange]), let month = Int(text[monthRange]),
            let day = Int(text[dayRange])
        else { throw InventoryCanonicalValueError.date }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? calendar.timeZone
        let components = DateComponents(
            calendar: calendar, timeZone: calendar.timeZone, year: year, month: month, day: day)
        guard let date = calendar.date(from: components) else {
            throw InventoryCanonicalValueError.date
        }
        let read = calendar.dateComponents([.year, .month, .day], from: date)
        guard read.year == year, read.month == month, read.day == day else {
            throw InventoryCanonicalValueError.date
        }
        self.text = text
    }
}

/// Canonical RFC 3339 UTC timestamp with exactly millisecond precision.
public struct InventoryCanonicalDateTime: Codable, Hashable, Sendable {
    public let text: String

    /// Validates the exact protocol-2 timestamp spelling and instant.
    public init(_ text: String) throws {
        let pattern = #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"#
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard text.range(of: pattern, options: .regularExpression) != nil,
            let date = formatter.date(from: text), formatter.string(from: date) == text
        else { throw InventoryCanonicalValueError.dateTime }
        self.text = text
    }
}

/// Absolute HTTPS URL in the canonical representation written to the wire.
public struct InventoryCanonicalURL: Codable, Hashable, Sendable {
    public let text: String

    /// Parses an HTTPS URL and keeps Foundation's canonical percent encoding.
    public init(_ text: String) throws {
        guard let parsed = URL(string: text), parsed.scheme?.lowercased() == "https",
            parsed.host != nil,
            var components = URLComponents(
                url: parsed.standardized, resolvingAgainstBaseURL: false)
        else {
            throw InventoryCanonicalValueError.url
        }
        components.scheme = "https"
        components.host = components.host?.lowercased()
        if components.port == 443 { components.port = nil }
        if components.path.isEmpty { components.path = "/" }
        guard let canonical = components.url?.absoluteString else {
            throw InventoryCanonicalValueError.url
        }
        self.text = canonical
    }

    /// Keeps a URL the server already canonicalised exactly as it spelled it,
    /// once it parses as an absolute HTTPS URL. The server canonicalises with
    /// WHATWG `URL.href`, which need not match Foundation's form in every
    /// case, and a value read from the server goes back to it unchanged.
    public init(canonical text: String) throws {
        _ = try Self(text)
        self.text = text
    }
}

/// Closed primitive field vocabulary introduced by inventory protocol 2.
public enum InventoryPrimitiveKind: String, Codable, Hashable, Sendable, CaseIterable {
    case shortText = "short_text"
    case longText = "long_text"
    case integer
    case decimal
    case boolean
    case enumeration = "enum"
    case measurement
    case date
    case dateTime = "date_time"
    case url
    case reference
}

/// Whether a field accepts exactly one value or a non-empty ordered collection.
public enum InventoryFieldCardinality: String, Codable, Hashable, Sendable {
    case one
    case many
}

/// Whether values are authoritative input or derived from a versioned expression.
public enum InventoryFieldStorage: String, Codable, Hashable, Sendable {
    case stored
    case computed
}

/// Entity kinds a protocol-2 reference may target.
public enum InventoryReferenceTargetKind: String, Codable, Hashable, Sendable {
    case item
    case location
}

/// The replica's current knowledge of a reference target.
public enum InventoryReferenceState: String, Codable, Hashable, Sendable {
    case resolved
    case deleted
    case missing
    case unresolved
}

/// Reference target constraints fixed when a catalogue field is first published.
public struct InventoryReferenceConstraint: Codable, Hashable, Sendable {
    public let targetKinds: Set<InventoryReferenceTargetKind>
    public let targetTypeIds: Set<String>

    public init(
        targetKinds: Set<InventoryReferenceTargetKind> = [],
        targetTypeIds: Set<String> = []
    ) {
        self.targetKinds = targetKinds
        self.targetTypeIds = targetTypeIds
    }
}

/// A stable reference identity plus the replica's optional read-time target state.
public struct InventoryReferenceValue: Codable, Hashable, Sendable {
    public let targetKind: InventoryReferenceTargetKind
    public let targetId: String
    public let targetState: InventoryReferenceState?

    public init(
        targetKind: InventoryReferenceTargetKind, targetId: String,
        targetState: InventoryReferenceState? = nil
    ) {
        self.targetKind = targetKind
        self.targetId = targetId
        self.targetState = targetState
    }
}

/// One canonical protocol-2 primitive value.
public enum InventoryPrimitiveValue: Codable, Hashable, Sendable {
    case string(String)
    case integer(InventoryInteger)
    case decimal(InventoryDecimal)
    case boolean(Bool)
    case enumeration(optionId: String)
    case measurement(amount: InventoryDecimal, unit: String)
    case date(InventoryCanonicalDate)
    case dateTime(InventoryCanonicalDateTime)
    case url(InventoryCanonicalURL)
    case reference(InventoryReferenceValue)
}

/// Authority that produced an effective field value.
public enum InventoryValueSource: String, Codable, Hashable, Sendable {
    case stored
    case computed
    case override
}

/// One item/field revision a computed value depended on.
public struct InventoryValueDependency: Codable, Hashable, Sendable {
    public let itemId: String
    public let fieldId: String
    public let revision: Int

    public init(itemId: String, fieldId: String, revision: Int) {
        self.itemId = itemId
        self.fieldId = fieldId
        self.revision = revision
    }
}

/// Why a computed field has no effective value.
public enum InventoryValueUnavailableReason: String, Codable, Hashable, Sendable {
    case missingDependency = "missing_dependency"
    case referenceUnresolved = "reference_unresolved"
    case referenceMissing = "reference_missing"
    case referenceDeleted = "reference_deleted"
    case evaluationError = "evaluation_error"
}

/// Effective value or explicit unavailability of one stable field ID.
public enum InventoryFieldValueState: Codable, Hashable, Sendable {
    case value([InventoryPrimitiveValue])
    case unavailable(reason: InventoryValueUnavailableReason)
}

/// One stable-ID field entry carried by an item, in catalogue order.
public struct InventoryItemFieldEntry: Codable, Hashable, Sendable {
    public let fieldId: String
    public let state: InventoryFieldValueState
    public let source: InventoryValueSource
    public let catalogueRevision: Int
    public let dependencies: [InventoryValueDependency]

    public init(
        fieldId: String, state: InventoryFieldValueState, source: InventoryValueSource,
        catalogueRevision: Int, dependencies: [InventoryValueDependency] = []
    ) {
        self.fieldId = fieldId
        self.state = state
        self.source = source
        self.catalogueRevision = catalogueRevision
        self.dependencies = dependencies
    }
}

extension InventoryInteger {
    /// Decodes through the validating initialiser, so a non-canonical value
    /// is `DecodingError.dataCorrupted`.
    public init(from decoder: any Decoder) throws {
        self = try decodeCanonical(Int64.self, key: .value, from: decoder, Self.init(_:))
    }
}

extension InventoryDecimal {
    /// Decodes through the validating initialiser, so a non-canonical value
    /// is `DecodingError.dataCorrupted`.
    public init(from decoder: any Decoder) throws {
        self = try decodeCanonical(String.self, key: .text, from: decoder, Self.init(_:))
    }
}

extension InventoryCanonicalDate {
    /// Decodes through the validating initialiser, so a non-canonical value
    /// is `DecodingError.dataCorrupted`.
    public init(from decoder: any Decoder) throws {
        self = try decodeCanonical(String.self, key: .text, from: decoder, Self.init(_:))
    }
}

extension InventoryCanonicalDateTime {
    /// Decodes through the validating initialiser, so a non-canonical value
    /// is `DecodingError.dataCorrupted`.
    public init(from decoder: any Decoder) throws {
        self = try decodeCanonical(String.self, key: .text, from: decoder, Self.init(_:))
    }
}

extension InventoryCanonicalURL {
    /// Decodes through the validating initialiser, so a non-canonical value
    /// is `DecodingError.dataCorrupted`.
    public init(from decoder: any Decoder) throws {
        self = try decodeCanonical(String.self, key: .text, from: decoder, Self.init(canonical:))
    }
}
