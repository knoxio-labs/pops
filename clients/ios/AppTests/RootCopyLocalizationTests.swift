import AppCore
import FeaturePurchases
import Foundation
import Testing

@testable import Pops

/// The shell in Portuguese, the catalogue that makes it so, and the one thing
/// only a built app can show: that the product carries both languages.
///
/// The packages resolve their copy from their own bundles, and iOS picks a
/// language for those from the ones the app itself declares. An app bundle
/// without `pt-BR` would leave every package in English however complete its
/// catalogue is.
@Suite("Root copy localisation")
internal struct RootCopyLocalizationTests {
    private static let english = Locale(identifier: "en-AU")
    private static let portuguese = Locale(identifier: "pt-BR")

    private static func audit() throws -> LocalizationCatalogAudit {
        let sources = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "App")
        return try LocalizationCatalogAudit(
            catalog: sources.appending(path: "Localizable.xcstrings"), sources: sources)
    }

    @Test("the built app declares both languages, with en-AU as the development language")
    func appBundleCarriesBothLanguages() {
        #expect(Set(Bundle.main.localizations).isSuperset(of: ["en-AU", "pt-BR"]))
        #expect(Bundle.main.developmentLocalization == "en-AU")
    }

    @Test("every sentence the shell resolves is in the catalogue, and nothing else is")
    func catalogueMatchesTheCode() throws {
        let audit = try Self.audit()

        #expect(audit.sourceLanguage == "en-AU")
        #expect(audit.unreadableCalls.isEmpty, "\(audit.unreadableCalls)")
        #expect(audit.usedKeys.count >= 25, "the scan found \(audit.usedKeys.count) sentences")
        #expect(audit.keysAbsentFromCatalog.isEmpty, "\(audit.keysAbsentFromCatalog)")
        #expect(audit.keysNoCodeUses.isEmpty, "\(audit.keysNoCodeUses)")
    }

    @Test("every catalogue entry has a pt-BR value")
    func everyKeyIsTranslated() throws {
        let missing = try Self.audit().keysMissingTranslation(in: "pt-BR")

        #expect(missing.isEmpty, "\(missing)")
    }

    @Test("the shell reads in Portuguese under pt-BR")
    func resolvesPortuguese() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(RootCopy.more == "Mais")
            #expect(RootCopy.retry == "Tentar novamente")
            #expect(RootCopy.DiagnosticLabel.requestID == "ID da solicitação")
            #expect(RootCopy.opensIn("inventory") == "Abre em Inventory")
            #expect(
                RootCopy.nothingAvailable([])
                    == "Seu servidor Pops ainda não oferece nada que este app possa mostrar.")
        }
    }

    @Test("the shell reads in English under en-AU")
    func resolvesEnglish() {
        LocalizedCopy.$localeOverride.withValue(Self.english) {
            #expect(RootCopy.more == "More")
            #expect(RootCopy.retry == "Try again")
            #expect(
                RootCopy.degraded
                    == "Some of Pops could not be reached, so this may be out of date.")
        }
    }

    /// The two reasons stay two sentences in Portuguese, joined in the order the
    /// features were withheld. A feature whose module is not translated keeps
    /// its English name inside the Portuguese sentence.
    @Test("each withheld feature keeps its own reason in Portuguese")
    func withheldReasonsInPortuguese() {
        let withheld = [
            FeatureAvailability(id: .transactions, reachability: .contractMismatch),
            FeatureAvailability(id: FeaturePurchases.feature, reachability: .unavailable),
        ]

        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(
                RootCopy.nothingAvailable(withheld)
                    == "Transações precisa de uma versão mais recente deste app. "
                    + "Purchases não está disponível no momento.")
        }
    }

    @Test("a guest's tabs are named in Portuguese")
    func guestTabsAreNamedInPortuguese() {
        LocalizedCopy.$localeOverride.withValue(Self.portuguese) {
            #expect(RootCopy.name(of: .transactions) == "Transações")
            #expect(RootCopy.name(of: .accounts) == "Contas")
        }
    }
}
