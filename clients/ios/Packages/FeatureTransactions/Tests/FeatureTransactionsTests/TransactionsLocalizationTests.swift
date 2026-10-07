import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureTransactions

/// Both transaction screens in Portuguese, and the catalogue that makes it so.
///
/// A sentence with no translation is not an error anywhere: it resolves to its
/// English and the screen reads as half-translated. The audit is what turns
/// that into a failure, and the resolved sentences below are what prove the
/// catalogue the audit read is the one the built bundle carries.
@Suite("Transactions localisation")
internal struct TransactionsLocalizationTests {
    private static let english = Locale(identifier: "en-AU")
    private static let portuguese = Locale(identifier: "pt-BR")

    private static let everyFailure: [RepositoryError] = [
        .unavailable, .unauthorized, .featureUnavailable, .rateLimited(retryAfterSeconds: 30),
        .rateLimited(retryAfterSeconds: nil), .contractMismatch, .conflict("already_saved"),
        .transport("URLError -1009"), .dependencyNotBound,
    ]

    private static func audit() throws -> LocalizationCatalogAudit {
        let sources = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureTransactions")
        return try LocalizationCatalogAudit(
            catalog: sources.appending(path: "Resources/Localizable.xcstrings"), sources: sources)
    }

    @Test("every sentence the code resolves is in the catalogue, and nothing else is")
    func catalogueMatchesTheCode() throws {
        let audit = try Self.audit()

        #expect(audit.sourceLanguage == "en-AU")
        #expect(audit.unreadableCalls.isEmpty, "\(audit.unreadableCalls)")
        #expect(audit.usedKeys.count >= 41, "the scan found \(audit.usedKeys.count) sentences")
        #expect(audit.keysAbsentFromCatalog.isEmpty, "\(audit.keysAbsentFromCatalog)")
        #expect(audit.keysNoCodeUses.isEmpty, "\(audit.keysNoCodeUses)")
    }

    @Test("every catalogue entry has a pt-BR value")
    func everyKeyIsTranslated() throws {
        let missing = try Self.audit().keysMissingTranslation(in: "pt-BR")

        #expect(missing.isEmpty, "\(missing)")
    }

    @Test("the screens read in Portuguese under pt-BR")
    func resolvesPortuguese() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(FeatureTransactions.displayName == "Transações")
            #expect(TransactionsCopy.empty == "Ainda não há transações.")
            #expect(TransactionsCopy.retry == "Tentar novamente")
            #expect(TransactionsCopy.FieldLabel.lastEdited == "Última edição")
            #expect(TransactionsCopy.message(for: .unauthorized).contains("não está mais"))
            #expect(TransactionsCopy.tagList(["café", "semanal"]) == "com as tags café, semanal")
        }
    }

    @Test("the screens read in English under en-AU")
    func resolvesEnglish() {
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(FeatureTransactions.displayName == "Transactions")
            #expect(TransactionsCopy.empty == "No transactions yet.")
            #expect(
                TransactionsCopy.message(for: .unavailable)
                    == "Your transactions are temporarily unreachable. "
                    + "Nothing is lost — try again in a moment.")
        }
    }

    @Test("the rate-limit wait follows each language's plural rule")
    func waitIsPluralisedPerLanguage() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(
                TransactionsCopy.message(for: .rateLimited(retryAfterSeconds: 1))
                    == "Muitas solicitações. Aguarde 1 segundo antes de tentar novamente.")
            #expect(
                TransactionsCopy.message(for: .rateLimited(retryAfterSeconds: 30))
                    == "Muitas solicitações. Aguarde 30 segundos antes de tentar novamente.")
            #expect(
                TransactionsCopy.retryTitle(for: .rateLimited(retryAfterSeconds: nil))
                    == "Aguarde um minuto e tente novamente")
        }
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(
                TransactionsCopy.message(for: .rateLimited(retryAfterSeconds: 1))
                    == "Too many requests. Wait 1 second before trying again.")
            #expect(
                TransactionsCopy.retryTitle(for: .rateLimited(retryAfterSeconds: 0))
                    == "Wait 1 second, then retry")
        }
    }

    @Test("no failure loses its distinct sentence in translation")
    func failuresStayDistinguishableInPortuguese() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            let messages = Self.everyFailure.map(TransactionsCopy.message(for:))

            #expect(Set(messages).count == messages.count, "\(messages)")
            #expect(!TransactionsCopy.message(for: .unavailable).contains(TransactionsCopy.empty))
        }
    }

    @Test("a known transaction type is named in the reader's language")
    func typesAreTranslated() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(TransactionsCopy.typeName(.purchase) == "compra")
            #expect(TransactionsCopy.typeName(.refund) == "reembolso")
            #expect(TransactionsCopy.typeName(.transfer) == "transferência")
        }
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(TransactionsCopy.typeName(.purchase) == "purchase")
        }
    }

    @Test("a transaction type this build has never heard of is shown as it arrived")
    func unknownTypeFallsBackToTheWireValue() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(TransactionsCopy.typeName(TransactionType(rawValue: "dividend")) == "dividend")
        }
    }

    @Test("a language the catalogue does not carry falls back to English")
    func unknownLanguageFallsBack() {
        LocalizedCopy.$localeOverride.withValue(Locale(identifier: "ja-JP")) {
            #expect(TransactionsCopy.empty == "No transactions yet.")
        }
    }
}
