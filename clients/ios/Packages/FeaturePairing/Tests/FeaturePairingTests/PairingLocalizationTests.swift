import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePairing

/// The pairing screen in Portuguese, and the catalogue that makes it so.
///
/// A sentence with no translation is not an error anywhere: it resolves to its
/// English and the screen reads as half-translated. The audit is what turns
/// that into a failure, and the resolved sentences below are what prove the
/// catalogue the audit read is the one the built bundle carries.
@Suite("Pairing localisation")
internal struct PairingLocalizationTests {
    private static let english = Locale(identifier: "en-AU")
    private static let portuguese = Locale(identifier: "pt-BR")

    private static func audit() throws -> LocalizationCatalogAudit {
        let sources = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeaturePairing")
        return try LocalizationCatalogAudit(
            catalog: sources.appending(path: "Resources/Localizable.xcstrings"), sources: sources)
    }

    @Test("every sentence the code resolves is in the catalogue, and nothing else is")
    func catalogueMatchesTheCode() throws {
        let audit = try Self.audit()

        #expect(audit.sourceLanguage == "en-AU")
        #expect(audit.unreadableCalls.isEmpty, "\(audit.unreadableCalls)")
        #expect(audit.usedKeys.count >= 29, "the scan found \(audit.usedKeys.count) sentences")
        #expect(audit.keysAbsentFromCatalog.isEmpty, "\(audit.keysAbsentFromCatalog)")
        #expect(audit.keysNoCodeUses.isEmpty, "\(audit.keysNoCodeUses)")
    }

    @Test("every catalogue entry has a pt-BR value")
    func everyKeyIsTranslated() throws {
        let missing = try Self.audit().keysMissingTranslation(in: "pt-BR")

        #expect(missing.isEmpty, "\(missing)")
    }

    @Test("the screen reads in Portuguese under pt-BR")
    func resolvesPortuguese() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(PairingCopy.title == "Parear este dispositivo")
            #expect(PairingCopy.pairButton == "Parear")
            #expect(
                PairingCopy.message(for: .codeRejected)
                    == "Esse código não funcionou. Gere um novo e tente outra vez.")
            #expect(
                PairingCopy.explanation(for: .revokedByOperator)
                    == "Este dispositivo foi removido do seu servidor Pops. "
                    + "Pareie-o novamente para continuar.")
            #expect(
                PairingCopy.blockedHint(for: .missingCode)
                    == "Informe primeiro o código de pareamento.")
        }
    }

    @Test("the screen reads in English under en-AU")
    func resolvesEnglish() {
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(PairingCopy.title == "Pair this device")
            #expect(
                PairingCopy.message(for: .credentialStorageFailed)
                    == "Paired, but this device could not store its credentials. "
                    + "Revoke it on the Devices page and pair again.")
        }
    }

    @Test("the wait follows each language's plural rule")
    func waitIsPluralisedPerLanguage() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(
                PairingCopy.message(for: .rateLimited(retryAfterSeconds: 1))
                    == "Muitas tentativas. Tente novamente em 1 segundo.")
            #expect(
                PairingCopy.message(for: .rateLimited(retryAfterSeconds: 30))
                    == "Muitas tentativas. Tente novamente em 30 segundos.")
        }
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(
                PairingCopy.message(for: .rateLimited(retryAfterSeconds: 1))
                    == "Too many attempts. Try again in 1 second.")
            #expect(
                PairingCopy.message(for: .rateLimited(retryAfterSeconds: 30))
                    == "Too many attempts. Try again in 30 seconds.")
        }
    }

    @Test("no failure loses its distinct sentence in translation")
    func failuresStayDistinguishableInPortuguese() {
        let failures: [PairingError] = [
            .codeRejected, .rateLimited(retryAfterSeconds: 30),
            .rateLimited(retryAfterSeconds: nil), .invalidRequest, .unreachable,
            .keyGenerationFailed, .credentialStorageFailed, .dependencyNotBound,
        ]
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            let messages = failures.map(PairingCopy.message(for:))

            #expect(Set(messages).count == messages.count, "\(messages)")
        }
    }

    @Test("a language the catalogue does not carry falls back to English")
    func unknownLanguageFallsBack() {
        LocalizedCopy.$localeOverride.withValue(Locale(identifier: "ja-JP")) {
            #expect(PairingCopy.title == "Pair this device")
        }
    }

    @Test("the placeholders that are a shape, not a sentence, are not translated")
    func shapesStayLiteral() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(PairingCopy.serverPlaceholder == "https://bfm.example.com")
            #expect(PairingCopy.codePlaceholder == "XXXX-XXXX-XXXX")
        }
    }
}
