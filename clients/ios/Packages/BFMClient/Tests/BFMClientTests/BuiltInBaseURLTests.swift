import Foundation
import Testing

@testable import BFMClient

@Suite("BuiltInBaseURL")
internal struct BuiltInBaseURLTests {
    private func resolve(
        environment: String? = nil,
        bakedIn: String? = nil,
        allowsEnvironmentOverride: Bool = true
    ) -> URL? {
        BuiltInBaseURL.resolve(
            environmentValue: environment,
            bakedInValue: bakedIn,
            allowsEnvironmentOverride: allowsEnvironmentOverride
        )
    }

    @Test("a Release build ships no base URL")
    func releaseShipsNothing() {
        #expect(resolve(bakedIn: "", allowsEnvironmentOverride: false) != nil)
        #expect(resolve(bakedIn: nil, allowsEnvironmentOverride: false) == nil)
    }

    @Test("a Release build cannot be re-pointed by its environment")
    func releaseIgnoresTheOverride() {
        #expect(
            resolve(
                environment: "https://attacker.example",
                bakedIn: "",
                allowsEnvironmentOverride: false
            ) == nil
        )
        #expect(
            resolve(
                environment: "https://attacker.example",
                bakedIn: "https://bfm.example",
                allowsEnvironmentOverride: false
            ) == URL(string: "https://bfm.example")
        )
    }

    @Test("a Debug build falls back to the baked-in value")
    func debugUsesBakedInValue() {
        #expect(resolve(bakedIn: "http://localhost:3014") == URL(string: "http://localhost:3014"))
    }

    @Test("a Debug build prefers the environment override")
    func debugPrefersTheOverride() {
        #expect(
            resolve(environment: "https://bfm.example", bakedIn: "http://localhost:3014")
                == URL(string: "https://bfm.example")
        )
    }

    @Test("an unusable override falls through to the baked-in value")
    func unusableOverrideFallsThrough() {
        for override in ["", "   ", "$(POPS_BFM_BASE_URL)", "localhost:3014", "/mobile"] {
            #expect(
                resolve(environment: override, bakedIn: "http://localhost:3014")
                    == URL(string: "http://localhost:3014"),
                "override \(override.debugDescription) should have been skipped"
            )
        }
    }

    @Test(
        "only HTTP and HTTPS are accepted",
        arguments: [
            "ftp://bfm.example",
            "file:///etc/hosts",
            "pops://bfm.example",
            "javascript:alert(1)",
        ])
    func rejectsForeignSchemes(_ raw: String) {
        #expect(resolve(bakedIn: raw) == nil)
    }

    @Test("a scheme with no host is rejected")
    func rejectsHostlessURLs() {
        #expect(resolve(bakedIn: "https://") == nil)
        #expect(resolve(bakedIn: "http:///mobile") == nil)
    }

    @Test("surrounding whitespace does not make a value unusable")
    func trimsWhitespace() {
        #expect(resolve(bakedIn: "  https://bfm.example\n") == URL(string: "https://bfm.example"))
    }

    @Test("a scheme is matched case-insensitively")
    func acceptsUppercaseScheme() {
        #expect(resolve(bakedIn: "HTTPS://bfm.example") == URL(string: "HTTPS://bfm.example"))
    }

    @Test("a path on the base URL is preserved")
    func preservesPath() {
        #expect(
            resolve(bakedIn: "https://pops.example/bfm-api")
                == URL(string: "https://pops.example/bfm-api"))
    }

    @Test("the Info.plist key matches the one project.yml populates")
    func infoDictionaryKeyIsStable() {
        #expect(BuiltInBaseURL.infoDictionaryKey == "POPSBFMBaseURL")
        #expect(BuiltInBaseURL.environmentOverrideKey == "POPS_BFM_BASE_URL")
    }

    @Test("the override is a Debug-only affordance")
    func overrideTracksBuildConfiguration() {
        #if DEBUG
            #expect(BuiltInBaseURL.allowsEnvironmentOverride)
        #else
            #expect(!BuiltInBaseURL.allowsEnvironmentOverride)
        #endif
    }
}
