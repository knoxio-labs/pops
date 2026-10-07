import Foundation

/// A copy enum's route to the String Catalog in its own bundle.
///
/// The English sentence is the catalogue key, so the copy enum stays the one
/// place a string is written and the catalogue only adds what differs from it:
/// the `pt-BR` translation, and the plural forms either language needs. A
/// sentence the catalogue has never heard of still resolves to its English.
///
/// Interpolated values are formatted for the language the sentence resolves
/// in, so an `Int` picks up that language's grouping and plural rule rather
/// than being concatenated in.
public struct LocalizedCopy: Sendable {
    /// The language to resolve in instead of the system's.
    ///
    /// `nil` outside a test. A test binds it to read a feature's copy in a
    /// language the machine running it is not set to; nothing in the app sets
    /// it, because the app follows the system language and has no switch.
    @TaskLocal public static var localeOverride: Locale?

    private let bundleURL: URL
    private let localizations: [String]
    private let developmentLocalization: String

    /// - Parameter bundle: The bundle whose `Localizable` catalogue holds the
    ///   caller's strings: `.module` in a package, `.main` in the app target.
    public init(bundle: Bundle) {
        bundleURL = bundle.bundleURL
        localizations = bundle.localizations
        developmentLocalization = bundle.developmentLocalization ?? "en"
    }

    /// The sentence in the language in force, or its English when the
    /// catalogue has no entry for it.
    public func callAsFunction(_ text: String.LocalizationValue) -> String {
        String(
            localized: LocalizedStringResource(
                text, locale: Locale(identifier: language), bundle: .atURL(bundleURL)))
    }

    /// The catalogue language that best fits the reader, never the reader's
    /// own locale. A reader whose language the catalogue lacks gets English
    /// sentences, and resolving those under their locale would apply its
    /// plural rule to them: Japanese has no singular, so "1 account" would
    /// read "1 accounts".
    private var language: String {
        let preferences = Self.localeOverride.map { [$0.identifier] } ?? Locale.preferredLanguages
        return Bundle.preferredLocalizations(from: localizations, forPreferences: preferences).first
            ?? developmentLocalization
    }
}
