import Foundation

/// What a module's String Catalog and the sentences its code resolves through
/// `LocalizedCopy` disagree about.
///
/// The catalogue is maintained by hand, because Xcode's extraction does not see
/// through `LocalizedCopy`. Nothing at build time notices a sentence added to a
/// copy enum and never translated: it resolves to its English in every
/// language. This reads both sides from the source tree so a test can say so.
public struct LocalizationCatalogAudit: Sendable {
    /// Every sentence the code resolves, in catalogue-key form.
    public let usedKeys: Set<String>
    /// `localized(` calls whose argument is not a string literal this can read,
    /// by file name. A non-empty list means ``usedKeys`` is incomplete.
    public let unreadableCalls: [String]
    public let sourceLanguage: String

    private let entries: [String: Entry]

    /// - Parameters:
    ///   - catalog: The `.xcstrings` file.
    ///   - sources: The directory whose `.swift` files resolve against it,
    ///     searched recursively.
    public init(catalog: URL, sources: URL) throws {
        let document = try JSONDecoder().decode(Document.self, from: Data(contentsOf: catalog))
        sourceLanguage = document.sourceLanguage
        entries = document.strings

        var used: Set<String> = []
        var unreadable: [String] = []
        for file in try Self.swiftFiles(under: sources) {
            let scan = LocalizedCallScanner(source: try String(contentsOf: file, encoding: .utf8))
            used.formUnion(scan.keys)
            unreadable += Array(repeating: file.lastPathComponent, count: scan.unreadable)
        }
        usedKeys = used
        unreadableCalls = unreadable
    }

    public var catalogKeys: Set<String> { Set(entries.keys.map(Self.comparable)) }

    /// Sentences the code resolves that the catalogue does not list.
    public var keysAbsentFromCatalog: [String] {
        usedKeys.subtracting(catalogKeys).sorted()
    }

    /// Catalogue entries no code resolves any more.
    public var keysNoCodeUses: [String] {
        catalogKeys.subtracting(usedKeys).sorted()
    }

    /// Catalogue entries with no usable value in `language`: absent, not marked
    /// translated, blank, or a plural missing its `one` or `other` form.
    public func keysMissingTranslation(in language: String) -> [String] {
        entries.filter { !($0.value.localizations?[language]?.isComplete ?? false) }.keys.sorted()
    }

    /// A catalogue key with its format specifiers reduced to the placeholder
    /// the scanner writes for an interpolation, so the two sides compare
    /// without the scanner having to know an argument's type.
    private static func comparable(_ key: String) -> String {
        key.replacing(/%(?:\d+\$)?(?:lld|@)/, with: LocalizedCallScanner.argument)
    }

    private static func swiftFiles(under directory: URL) throws -> [URL] {
        guard
            let walker = FileManager.default.enumerator(
                at: directory, includingPropertiesForKeys: nil)
        else { throw CocoaError(.fileReadNoSuchFile) }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }
}

extension LocalizationCatalogAudit {
    private struct Document: Decodable {
        let sourceLanguage: String
        let strings: [String: Entry]
    }

    private struct Entry: Decodable, Sendable {
        let localizations: [String: Localization]?
    }

    private struct Localization: Decodable, Sendable {
        let stringUnit: StringUnit?
        let variations: Variations?

        var isComplete: Bool {
            if let stringUnit { return stringUnit.isComplete }
            guard let plural = variations?.plural else { return false }
            return ["one", "other"].allSatisfy { plural[$0]?.stringUnit.isComplete ?? false }
        }
    }

    private struct Variations: Decodable, Sendable {
        let plural: [String: PluralForm]?
    }

    private struct PluralForm: Decodable, Sendable {
        let stringUnit: StringUnit
    }

    private struct StringUnit: Decodable, Sendable {
        let state: String
        let value: String

        var isComplete: Bool {
            state == "translated" && !value.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }
}
