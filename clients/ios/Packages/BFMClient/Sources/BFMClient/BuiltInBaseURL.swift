import Foundation

/// The BFM base URL a build ships with, if it ships one at all.
///
/// Release ships none. A device learns where its BFM lives when it pairs — the
/// QR carries the base URL alongside the pairing code — so the shipped binary
/// names no host and pointing the app at a different deployment is a re-pair
/// rather than a rebuild. `resolve` returning `nil` is therefore the normal
/// Release state, not a failure: it means "ask the pairing store".
///
/// Debug bakes in a local default so simulator work does not have to pair first,
/// and honours an environment override so a scheme can aim one run somewhere
/// else. Release ignores the override, which is what stops a shipped app from
/// being re-pointed by whoever launches it.
public enum BuiltInBaseURL {
    /// Key in the app's `Info.plist`, populated from the `POPS_BFM_BASE_URL`
    /// build setting.
    public static let infoDictionaryKey = "POPSBFMBaseURL"

    /// Environment variable read ahead of the baked-in value in Debug builds.
    public static let environmentOverrideKey = "POPS_BFM_BASE_URL"

    /// Whether this build lets the environment override the baked-in value.
    public static let allowsEnvironmentOverride: Bool = {
        #if DEBUG
            return true
        #else
            return false
        #endif
    }()

    /// The base URL for the running build, or `nil` when it ships without one.
    public static var current: URL? {
        resolve(
            environmentValue: ProcessInfo.processInfo.environment[environmentOverrideKey],
            bakedInValue: Bundle.main.object(forInfoDictionaryKey: infoDictionaryKey) as? String,
            allowsEnvironmentOverride: allowsEnvironmentOverride
        )
    }

    /// Picks the first usable candidate, preferring the environment override
    /// where the build allows one.
    ///
    /// An unusable candidate is skipped rather than fatal, because both sources
    /// are expected to be absent or empty in a normal Release build: the
    /// `Info.plist` value is a build-setting substitution that Release defines as
    /// the empty string.
    public static func resolve(
        environmentValue: String?,
        bakedInValue: String?,
        allowsEnvironmentOverride: Bool
    ) -> URL? {
        let candidates =
            allowsEnvironmentOverride
            ? [environmentValue, bakedInValue]
            : [bakedInValue]

        return candidates.lazy.compactMap { $0.flatMap(usableURL) }.first
    }

    /// Rejects anything that is not an absolute HTTP(S) URL with a host.
    ///
    /// The bar is deliberately higher than `URL(string:)`, which accepts a bare
    /// path and would turn an unexpanded `$(POPS_BFM_BASE_URL)` — what a
    /// mis-declared build setting leaves in the `Info.plist` — into a relative
    /// URL that fails much later, at the first request.
    private static func usableURL(_ raw: String) -> URL? {
        guard
            let components = URLComponents(
                string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
            let scheme = components.scheme?.lowercased(),
            scheme == "http" || scheme == "https",
            let host = components.host,
            !host.isEmpty,
            let url = components.url
        else { return nil }

        return url
    }
}
