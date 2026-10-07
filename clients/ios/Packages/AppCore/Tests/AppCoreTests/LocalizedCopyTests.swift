import AppCore
import Foundation
import Testing

/// `LocalizedCopy` against a bundle with no catalogue at all, which is the one
/// case this package can stage. The translated cases are each feature's own:
/// they need a compiled catalogue, and this package ships none.
@Suite("Localized copy")
internal struct LocalizedCopyTests {
    private let copy = LocalizedCopy(bundle: .main)

    @Test("a sentence no catalogue lists resolves to itself")
    func unknownSentenceIsItsOwnEnglish() {
        #expect(copy("Nothing translates this.") == "Nothing translates this.")
    }

    @Test("interpolated values reach a sentence no catalogue lists")
    func interpolationSurvivesTheFallback() {
        let who = "Rosane"

        #expect(copy("\(3) entries with \(who)") == "3 entries with Rosane")
    }

    @Test("an override for a language the bundle lacks still yields the English")
    func overrideWithoutACatalogue() {
        LocalizedCopy.$localeOverride.withValue(Locale(identifier: "pt-BR")) {
            #expect(copy("Nothing translates this.") == "Nothing translates this.")
        }
    }

    @Test("the override is nil unless a test binds it")
    func overrideDefaultsToNil() {
        #expect(LocalizedCopy.localeOverride == nil)
    }
}
