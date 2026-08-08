import BFMClient
import Foundation
import Testing

/// What the app's `Info.plist` carries once the build system is done with it.
///
/// None of this is reachable from `swift test`. `BuiltInBaseURL.current` reads
/// `Bundle.main`, and in a `swift test` binary that is the `xctest` runner, not
/// an app — so `BFMClientTests` can only exercise `resolve(_:_:_:)`, the pure
/// function underneath. Everything between a build setting in `project.yml` and
/// the string that function receives at runtime is untested there: the
/// per-configuration value, the substitution into `App/Info.plist`, and whether
/// Xcode carried the key into the built product at all.
///
/// That gap is not hypothetical. Xcode honours `INFOPLIST_KEY_*` only for keys
/// on its own allowlist and drops the rest without a word, which is why the base
/// URL goes through a real `Info.plist` in the first place.
@Suite("App bundle")
internal struct AppBundleTests {
    private func infoValue(_ key: String) -> Any? {
        Bundle.main.object(forInfoDictionaryKey: key)
    }

    /// Absence and emptiness are the same thing to every reader of this value,
    /// and they mean opposite things about the build. Release is *supposed* to
    /// carry an empty string here; a key that never arrived would look
    /// identical and would make the rest of this suite vacuous.
    @Test("the built product carries the BFM base URL key at all")
    func carriesTheBaseURLKey() throws {
        let raw = try #require(
            infoValue(BuiltInBaseURL.infoDictionaryKey) as? String,
            """
            \(BuiltInBaseURL.infoDictionaryKey) is missing from the built Info.plist. \
            Either project.yml stopped populating POPS_BFM_BASE_URL, or the key was \
            renamed on one side only.
            """
        )
        #expect(!raw.contains("$("), "the build setting reached the plist unexpanded: \(raw)")
    }

    /// The configuration split, asserted from inside the product rather than
    /// from a build setting dump. `mise run verify:release-carries-no-host`
    /// makes the Release half of this claim about a Release binary from the
    /// outside; this is the Debug half, from the inside.
    @Test("the resolved base URL matches what this configuration is meant to ship")
    func resolvesTheConfigurationsBaseURL() {
        #if DEBUG
            #expect(BuiltInBaseURL.current != nil, "a Debug build resolves no BFM base URL")
        #else
            #expect(BuiltInBaseURL.current == nil, "a Release build resolved a BFM base URL")
        #endif
    }

    /// The camera purpose string. Its absence is not a build failure and not a
    /// warning — it is a crash, in the pairing scanner, on a device, the first
    /// time someone points the app at a QR code.
    @Test("the built product declares why it wants the camera")
    func declaresCameraUsage() throws {
        let purpose = try #require(
            infoValue("NSCameraUsageDescription") as? String,
            "NSCameraUsageDescription is missing; the pairing scanner would crash on launch"
        )
        #expect(!purpose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    /// The host, identified. Every other assertion in this file reads
    /// `Bundle.main` and means nothing if the tests are running unhosted — in
    /// that case `Bundle.main` is the runner, and a missing key would be
    /// reported against the wrong bundle.
    @Test("the tests are running inside the app, not beside it")
    func areHostedByTheApp() {
        #expect(Bundle.main.bundleIdentifier == "com.knoxiolabs.pops")
    }
}
