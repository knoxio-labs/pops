import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureAccounts

/// The accounts screens in Portuguese, and the catalogue that makes it so.
///
/// A sentence with no translation is not an error anywhere: it resolves to its
/// English and the screen reads as half-translated. The audit is what turns
/// that into a failure, and the resolved sentences below are what prove the
/// catalogue the audit read is the one the built bundle carries.
@Suite("Accounts localisation")
internal struct AccountsLocalizationTests {
    private static let english = Locale(identifier: "en-AU")
    private static let portuguese = Locale(identifier: "pt-BR")

    private static func audit() throws -> LocalizationCatalogAudit {
        let sources = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureAccounts")
        return try LocalizationCatalogAudit(
            catalog: sources.appending(path: "Resources/Localizable.xcstrings"), sources: sources)
    }

    @Test("every sentence the code resolves is in the catalogue, and nothing else is")
    func catalogueMatchesTheCode() throws {
        let audit = try Self.audit()

        #expect(audit.sourceLanguage == "en-AU")
        #expect(audit.unreadableCalls.isEmpty, "\(audit.unreadableCalls)")
        #expect(audit.usedKeys.count >= 86, "the scan found \(audit.usedKeys.count) sentences")
        #expect(audit.keysAbsentFromCatalog.isEmpty, "\(audit.keysAbsentFromCatalog)")
        #expect(audit.keysNoCodeUses.isEmpty, "\(audit.keysNoCodeUses)")
    }

    @Test("every catalogue entry has a pt-BR value")
    func everyKeyIsTranslated() throws {
        let missing = try Self.audit().keysMissingTranslation(in: "pt-BR")

        #expect(missing.isEmpty, "\(missing)")
    }

    @Test("the list reads in Portuguese under pt-BR")
    func resolvesPortuguese() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(FeatureAccounts.displayName == "Contas")
            #expect(AccountsCopy.sectionArchived == "Arquivadas")
            #expect(AccountsCopy.retry == "Tentar novamente")
            #expect(AccountsCopy.message(for: .unauthorized).contains("não está mais"))
            #expect(
                AccountsCopy.refreshFailure(.conflict("already_saved"))
                    == "Não foi possível atualizar as contas. "
                    + "Essa alteração entra em conflito com algo já salvo.")
        }
    }

    @Test("the list reads in English under en-AU")
    func resolvesEnglish() {
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(FeatureAccounts.displayName == "Accounts")
            #expect(
                AccountsCopy.refreshFailure(.unauthorized)
                    == "Accounts could not be refreshed. This device is no longer signed in.")
            #expect(
                AccountsCopy.message(for: .unavailable)
                    == "Your accounts are temporarily unreachable. "
                    + "Nothing is lost — try again in a moment.")
        }
    }

    @Test("the count line follows Portuguese plurals for both counts")
    func countLineInPortuguese() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(AccountsCopy.countLine(active: 1, archived: 0) == "1 conta")
            #expect(AccountsCopy.countLine(active: 3, archived: 0) == "3 contas")
            #expect(AccountsCopy.countLine(active: 4, archived: 1) == "4 contas · 1 arquivada")
            #expect(AccountsCopy.countLine(active: 4, archived: 2) == "4 contas · 2 arquivadas")
        }
    }

    @Test("a count is grouped the way its language groups numbers")
    func countsAreFormattedPerLanguage() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(AccountsCopy.transactionCount(1) == "1 transação")
            #expect(AccountsCopy.transactionCount(1234) == "1.234 transações")
        }
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(AccountsCopy.transactionCount(1) == "1 transaction")
            #expect(AccountsCopy.transactionCount(1234) == "1,234 transactions")
        }
    }

    @Test("a sentence with two values keeps them in the order it names them")
    func argumentsKeepTheirOrder() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(AccountsCopy.storedValue(left: "A$5", of: "A$50") == "Restam A$5 de A$50")
            #expect(AccountsCopy.entries(1, with: "Rosane") == "1 lançamento com Rosane")
            #expect(AccountsCopy.entries(12, with: "Rosane") == "12 lançamentos com Rosane")
            #expect(
                AccountsCopy.limitUse(percent: 40, limit: "A$5.000", available: "A$3.000")
                    == "40% de A$5.000 usado · A$3.000 disponível")
        }
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(AccountsCopy.storedValue(left: "$5", of: "$50") == "$5 left of $50")
            #expect(AccountsCopy.entries(12, with: "Rosane") == "12 entries with Rosane")
            #expect(
                AccountsCopy.limitUse(percent: 40, limit: "$5,000", available: "$3,000")
                    == "40% of $5,000 used · $3,000 available")
        }
    }

    @Test("a person ledger says who owes whom in Portuguese")
    func ledgerDirectionInPortuguese() {
        let presentation = AccountPresentation(locale: Self.portuguese)
        let owed = Account.fake(
            kind: .person, balance: MoneyAmount(minorUnits: 500, currencyCode: "AUD"),
            contact: "Rosane")
        let owing = Account.fake(
            kind: .person, balance: MoneyAmount(minorUnits: -500, currencyCode: "AUD"),
            contact: "Rosane")

        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(presentation.balanceCaption(owed) == "Rosane deve a você")
            #expect(presentation.balanceCaption(owing) == "Você deve a Rosane")
            #expect(presentation.readBalance(owed).note == "devem a você")
            #expect(presentation.readBalance(owing).note == "você deve")
        }
    }

    @Test("the direction of a change is a different sentence, not a swapped word")
    func directionsAreDistinct() {
        for locale in [Self.english, Self.portuguese] {
            LocalizedCopy.$localeOverride.withValue(locale) {
                #expect(
                    AccountsCopy.trend(rose: true, by: "$1")
                        != AccountsCopy.trend(rose: false, by: "$1"))
                #expect(
                    AccountsCopy.cycleChange(rose: true, by: "$1")
                        != AccountsCopy.cycleChange(rose: false, by: "$1"))
            }
        }
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(AccountsCopy.trend(rose: true, by: "$1") == "Up $1 over 12 months")
            #expect(AccountsCopy.cycleChange(rose: false, by: "$1") == "Down $1 on last cycle")
        }
    }

    @Test("a known kind is named in the reader's language; an unknown one keeps its id")
    func kindLabels() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(AccountKindLabel.label(for: .creditCard) == "Cartão de crédito")
            #expect(AccountKindLabel.label(for: .person) == "Pessoa")
            #expect(
                AccountKindLabel.label(for: AccountKind(rawValue: "term-deposit"))
                    == "Term Deposit")
        }
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(AccountKindLabel.label(for: .creditCard) == "Credit card")
        }
    }

    @Test("a language the catalogue does not carry falls back to English")
    func unknownLanguageFallsBack() {
        LocalizedCopy.$localeOverride.withValue(Locale(identifier: "ja-JP")) {
            #expect(AccountsCopy.title == "Accounts")
            #expect(AccountsCopy.countLine(active: 1, archived: 0) == "1 account")
        }
    }
}
