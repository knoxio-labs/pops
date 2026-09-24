import Foundation
import Testing

@testable import AppCore

@Suite("A primitive value conformed to its field's kind")
internal struct InventoryPrimitiveKindConformanceTests {
    private static let optionId = "a1b2c3d4-0000-4000-8000-00000000000a"
    private static let targetId = "6c0a2f6e-9d1b-4f3a-8e57-1b2c3d4e5f60"

    @Test("a wire string becomes the decimal, date, timestamp or URL its field declares")
    func stringsTakeTheirDeclaredKind() throws {
        #expect(
            InventoryPrimitiveValue.string("12.30").conformed(to: .decimal)
                == .decimal(try InventoryDecimal("12.30")))
        #expect(
            InventoryPrimitiveValue.string("2024-02-29").conformed(to: .date)
                == .date(try InventoryCanonicalDate("2024-02-29")))
        #expect(
            InventoryPrimitiveValue.string("2026-09-24T10:11:12.345Z").conformed(to: .dateTime)
                == .dateTime(try InventoryCanonicalDateTime("2026-09-24T10:11:12.345Z")))
        #expect(
            InventoryPrimitiveValue.string("https://example.com/a").conformed(to: .url)
                == .url(try InventoryCanonicalURL("https://example.com/a")))
        #expect(
            InventoryPrimitiveValue.string("Brass").conformed(to: .shortText) == .string("Brass"))
    }

    @Test("an already typed value of the declared kind is unchanged")
    func typedValuesPassThrough() throws {
        let values: [(InventoryPrimitiveValue, InventoryPrimitiveKind)] = [
            (.integer(try InventoryInteger(-3)), .integer),
            (.decimal(try InventoryDecimal("0.000000001")), .decimal),
            (.boolean(false), .boolean),
            (.enumeration(optionId: Self.optionId), .enumeration),
            (.measurement(amount: try InventoryDecimal("2.50"), unit: "kg"), .measurement),
            (.date(try InventoryCanonicalDate("2026-12-31")), .date),
            (.dateTime(try InventoryCanonicalDateTime("2026-01-01T00:00:00.000Z")), .dateTime),
            (.url(try InventoryCanonicalURL("https://example.org/a?b=c")), .url),
        ]
        for (value, kind) in values {
            #expect(value.conformed(to: kind) == value, "\(kind)")
        }
    }

    @Test("the option, unit and target a value names are the catalogue's to check, not the kind's")
    func identityIsNotTheKindsConcern() throws {
        let values: [(InventoryPrimitiveValue, InventoryPrimitiveKind)] = [
            (.enumeration(optionId: "not-a-uuid"), .enumeration),
            (.measurement(amount: try InventoryDecimal("1"), unit: "g"), .measurement),
            (.reference(.init(targetKind: .item, targetId: "lamp")), .reference),
        ]
        for (value, kind) in values {
            #expect(value.conformed(to: kind) == value, "\(kind)")
        }
    }

    @Test("a URL keeps the server's spelling rather than Foundation's")
    func urlKeepsServerSpelling() throws {
        let spelled = "https://EXAMPLE.com:443/a/../b"
        let conformed = try #require(InventoryPrimitiveValue.string(spelled).conformed(to: .url))
        #expect(conformed == .url(try InventoryCanonicalURL(canonical: spelled)))
        guard case .url(let url) = conformed else { return }
        #expect(url.text == spelled)
    }

    @Test("a reference keeps the read-time state it arrived with")
    func referenceKeepsState() {
        let reference = InventoryPrimitiveValue.reference(
            .init(targetKind: .location, targetId: Self.targetId, targetState: .deleted))
        #expect(reference.conformed(to: .reference) == reference)
    }

    @Test("text is 1 to 200 scalars when short and 1 to 20,000 when long")
    func textLengthBounds() {
        func conformed(_ text: String, _ kind: InventoryPrimitiveKind) -> InventoryPrimitiveValue? {
            InventoryPrimitiveValue.string(text).conformed(to: kind)
        }
        #expect(conformed("", .shortText) == nil)
        #expect(conformed("", .longText) == nil)
        let short = String(repeating: "a", count: 200)
        #expect(conformed(short, .shortText) == .string(short))
        #expect(conformed(short + "a", .shortText) == nil)
        let flags = String(repeating: "🇦🇺", count: 100)
        #expect(conformed(flags, .shortText) == .string(flags))
        #expect(conformed(flags + "a", .shortText) == nil)
        let long = String(repeating: "a", count: 20_000)
        #expect(conformed(long, .longText) == .string(long))
        #expect(conformed(long + "a", .longText) == nil)
    }

    @Test("a value that is not its field's kind has no conformed form")
    func mismatchesAreNil() throws {
        let mismatches: [(InventoryPrimitiveValue, InventoryPrimitiveKind)] = [
            (.integer(try InventoryInteger(7)), .shortText),
            (.decimal(try InventoryDecimal("12.3")), .shortText),
            (.string("42"), .integer),
            (.integer(try InventoryInteger(12)), .decimal),
            (.string("12.3.4"), .decimal),
            (.string("-0"), .decimal),
            (.string("1.0000000001"), .decimal),
            (.string("true"), .boolean),
            (.string(Self.optionId), .enumeration),
            (.string("2.50"), .measurement),
            (.string("2026-02-30"), .date),
            (.date(try InventoryCanonicalDate("2026-01-01")), .dateTime),
            (.string("2026-09-24T10:11:12Z"), .dateTime),
            (.string("http://example.com/"), .url),
            (.string("not a url"), .url),
            (.integer(try InventoryInteger(3)), .url),
            (.string(Self.targetId), .reference),
        ]
        for (value, kind) in mismatches {
            #expect(value.conformed(to: kind) == nil, "\(value) as \(kind)")
        }
    }

    @Test("a stored canonical wrapper that is not canonical fails to decode")
    func decodingValidates() throws {
        let decoder = JSONDecoder()
        let refusals: [(String, any Decodable.Type)] = [
            (#"{"value":9007199254740992}"#, InventoryInteger.self),
            (#"{"text":"12.3.4"}"#, InventoryDecimal.self),
            (#"{"text":"2025-02-29"}"#, InventoryCanonicalDate.self),
            (#"{"text":"2026-09-24T10:11:12Z"}"#, InventoryCanonicalDateTime.self),
            (#"{"text":"http://example.com/"}"#, InventoryCanonicalURL.self),
        ]
        for (json, type) in refusals {
            #expect(throws: DecodingError.self, "\(json)") {
                _ = try decoder.decode(type, from: Data(json.utf8))
            }
        }
    }

    @Test("a canonical wrapper survives an encode and decode unchanged")
    func codableRoundTrip() throws {
        let values: [InventoryPrimitiveValue] = [
            .integer(try InventoryInteger(9_007_199_254_740_991)),
            .decimal(try InventoryDecimal("-12.30")),
            .date(try InventoryCanonicalDate("2024-02-29")),
            .dateTime(try InventoryCanonicalDateTime("2026-09-24T10:11:12.345Z")),
            .url(try InventoryCanonicalURL(canonical: "https://EXAMPLE.com:443/a/../b")),
        ]
        for value in values {
            let data = try JSONEncoder().encode(value)
            #expect(try JSONDecoder().decode(InventoryPrimitiveValue.self, from: data) == value)
        }
    }
}
