import AppCoreFakes
import Foundation
import Testing

/// The audit every localised module's tests lean on, checked against trees it
/// should and should not accept. An audit that reads nothing passes everything,
/// so each way it can come up empty or blind is staged here.
@Suite("Localisation catalogue audit")
internal struct LocalizationCatalogAuditTests {
    private static func audit(catalog: String, source: String) throws -> LocalizationCatalogAudit {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "catalog-audit-\(UUID().uuidString)")
        let sources = root.appending(path: "Sources/Nested")
        try FileManager.default.createDirectory(at: sources, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let catalogURL = root.appending(path: "Localizable.xcstrings")
        try Data(catalog.utf8).write(to: catalogURL)
        try Data(source.utf8).write(to: sources.appending(path: "Copy.swift"))
        try Data("localized(\"Not Swift\")".utf8).write(to: sources.appending(path: "Notes.md"))
        return try LocalizationCatalogAudit(
            catalog: catalogURL, sources: root.appending(path: "Sources"))
    }

    private static func catalog(_ strings: String) -> String {
        "{ \"sourceLanguage\": \"en-AU\", \"version\": \"1.0\", \"strings\": { \(strings) } }"
    }

    private static func translated(_ key: String, _ value: String = "x") -> String {
        """
        "\(key)": { "localizations": { "pt-BR": {
            "stringUnit": { "state": "translated", "value": "\(value)" } } } }
        """
    }

    @Test("a matching catalogue and source disagree about nothing")
    func matchingTreeIsClean() throws {
        let audit = try Self.audit(
            catalog: Self.catalog(
                [Self.translated("Retry"), Self.translated("%lld accounts")]
                    .joined(separator: ",")),
            source: """
                enum Copy {
                    static var retry: String { localized("Retry") }
                    static func count(_ n: Int) -> String { Copy.localized("\\(n) accounts") }
                }
                """)

        #expect(audit.sourceLanguage == "en-AU")
        #expect(audit.usedKeys.count == 2)
        #expect(audit.unreadableCalls.isEmpty)
        #expect(audit.keysAbsentFromCatalog.isEmpty)
        #expect(audit.keysNoCodeUses.isEmpty)
        #expect(audit.keysMissingTranslation(in: "pt-BR").isEmpty)
    }

    @Test("a sentence the catalogue never heard of is reported")
    func untranslatedSentenceIsReported() throws {
        let audit = try Self.audit(
            catalog: Self.catalog(Self.translated("Retry")),
            source: "let a = localized(\"Retry\"); let b = localized(\"Brand new\")")

        #expect(audit.keysAbsentFromCatalog == ["Brand new"])
    }

    @Test("a catalogue entry no code resolves is reported")
    func staleEntryIsReported() throws {
        let audit = try Self.audit(
            catalog: Self.catalog(
                [Self.translated("Retry"), Self.translated("Gone")].joined(separator: ",")),
            source: "let a = localized(\"Retry\")")

        #expect(audit.keysNoCodeUses == ["Gone"])
    }

    @Test("every interpolation is one argument, whatever its type or its parentheses")
    func interpolationsBecomeArguments() throws {
        let audit = try Self.audit(
            catalog: Self.catalog(
                [
                    Self.translated("%lld%% of %@ used"),
                    Self.translated("%1$@ in %2$@"),
                    Self.translated("%@ needs an update."),
                ].joined(separator: ",")),
            source: """
                let a = localized("\\(percent)% of \\(limit) used")
                let b = localized("\\(amount) in \\(month)")
                let c = localized("\\(name(of: feature.id)) needs an update.")
                """)

        #expect(audit.keysAbsentFromCatalog.isEmpty, "\(audit.keysAbsentFromCatalog)")
        #expect(audit.keysNoCodeUses.isEmpty, "\(audit.keysNoCodeUses)")
        #expect(audit.unreadableCalls.isEmpty)
    }

    @Test("a multi-line literal is read as the one sentence it is")
    func multiLineLiteralIsJoined() throws {
        let audit = try Self.audit(
            catalog: Self.catalog(Self.translated("First half. Second half.")),
            source: """
                let a = localized(
                    \"\"\"
                    First half. \\
                    Second half.
                    \"\"\")
                """)

        #expect(audit.usedKeys == ["First half. Second half."])
        #expect(audit.keysAbsentFromCatalog.isEmpty)
    }

    @Test("a call whose argument is not a literal is unreadable, not skipped")
    func nonLiteralArgumentIsUnreadable() throws {
        let audit = try Self.audit(
            catalog: Self.catalog(Self.translated("Retry")),
            source: "let a = localized(sentence); let b = localized(\"Retry\")")

        #expect(audit.unreadableCalls == ["Copy.swift"])
        #expect(audit.usedKeys == ["Retry"])
    }

    @Test("an escape the scanner cannot spell as a key is unreadable")
    func unsupportedEscapeIsUnreadable() throws {
        let audit = try Self.audit(
            catalog: Self.catalog(Self.translated("Retry")),
            source: "let a = localized(\"Line\\nbreak\")")

        #expect(audit.unreadableCalls == ["Copy.swift"])
    }

    @Test("a longer identifier ending in the same word is not a call")
    func longerIdentifierIsIgnored() throws {
        let audit = try Self.audit(
            catalog: Self.catalog(Self.translated("Retry")),
            source: "let a = unlocalized(\"Ignored\"); let b = localized(\"Retry\")")

        #expect(audit.usedKeys == ["Retry"])
    }

    private static let incompleteEntries: [String] = [
        #""Retry": {}"#,
        #""Retry": { "localizations": { "fr": { "stringUnit": { "state": "translated", "value": "x" } } } }"#,
        #""Retry": { "localizations": { "pt-BR": { "stringUnit": { "state": "new", "value": "x" } } } }"#,
        #""Retry": { "localizations": { "pt-BR": { "stringUnit": { "state": "translated", "value": "  " } } } }"#,
        #"""
        "Retry": { "localizations": { "pt-BR": { "variations": { "plural": {
            "other": { "stringUnit": { "state": "translated", "value": "x" } } } } } } }
        """#,
    ]

    @Test(
        "an entry without a usable pt-BR value is reported",
        arguments: LocalizationCatalogAuditTests.incompleteEntries)
    func incompleteTranslationIsReported(entry: String) throws {
        let audit = try Self.audit(
            catalog: Self.catalog(entry), source: "let a = localized(\"Retry\")")

        #expect(audit.keysMissingTranslation(in: "pt-BR") == ["Retry"])
    }

    @Test("a plural with both forms counts as translated")
    func completePluralIsTranslated() throws {
        let entry = #"""
            "%lld accounts": { "localizations": { "pt-BR": { "variations": { "plural": {
                "one": { "stringUnit": { "state": "translated", "value": "%lld conta" } },
                "other": { "stringUnit": { "state": "translated", "value": "%lld contas" } }
            } } } } }
            """#
        let audit = try Self.audit(
            catalog: Self.catalog(entry), source: "let a = localized(\"\\(n) accounts\")")

        #expect(audit.keysMissingTranslation(in: "pt-BR").isEmpty)
        #expect(audit.keysAbsentFromCatalog.isEmpty)
    }

    @Test("a catalogue that is not there is an error, not an empty audit")
    func missingCatalogueThrows() {
        let nowhere = FileManager.default.temporaryDirectory
            .appending(path: "catalog-audit-missing-\(UUID().uuidString)")

        #expect(throws: (any Error).self) {
            try LocalizationCatalogAudit(
                catalog: nowhere.appending(path: "Localizable.xcstrings"), sources: nowhere)
        }
    }
}
