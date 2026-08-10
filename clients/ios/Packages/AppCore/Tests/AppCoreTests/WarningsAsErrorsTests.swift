import Foundation
import Testing

/// Warnings are errors in every package, asserted by reading the manifests that
/// each have to say so on their own.
///
/// `project.yml` sets `SWIFT_TREAT_WARNINGS_AS_ERRORS` on the app target and it
/// stops there: SwiftPM compiles each package from its own `Package.swift`,
/// largely independent of the project consuming it. So the setting is restated
/// once per package, and nothing but this reads all of them together. The
/// seventh package added without it would be warning-tolerant code linked into
/// a warning-intolerant app — which is how a main-actor isolation violation
/// once sat through every gate this repo has.
@Suite("Warnings as errors")
internal struct WarningsAsErrorsTests {
    @Test("every package's manifest treats warnings as errors, on every target")
    func everyManifestTreatsWarningsAsErrors() throws {
        let packages = try PackageTree.names()
        #expect(!packages.isEmpty, "no package directory under Packages/")

        for package in packages.sorted() {
            let manifest = try PackageTree.manifestSource(ofPackage: package)
            let faults = ManifestAudit.faults(in: manifest)
            #expect(faults.isEmpty, "\(package)/Package.swift — \(faults.joined(separator: "; "))")
        }
    }

    /// The audit is run against a violation on every run, not only on the day
    /// someone commits one. A guard nobody has watched fail is not evidence it
    /// can.
    @Test("the audit reports a manifest that opts out")
    func theAuditReportsAnOptOut() {
        #expect(ManifestAudit.faults(in: ManifestFixture.compliant).isEmpty)

        #expect(!ManifestAudit.faults(in: ManifestFixture.oldToolsVersion).isEmpty)
        #expect(!ManifestAudit.faults(in: ManifestFixture.targetWithoutSettings).isEmpty)
        #expect(!ManifestAudit.faults(in: ManifestFixture.warningsLeftAsWarnings).isEmpty)
        #expect(!ManifestAudit.faults(in: ManifestFixture.settingOnlyInAComment).isEmpty)
    }
}

/// What a `Package.swift` in this tree has to say, and why each part of it is
/// load-bearing rather than a house style.
private enum ManifestAudit {
    /// The one name every manifest gives its setting list. Fixed rather than
    /// inferred: the counting below is only conclusive because every target
    /// spells the argument identically, and Swift rejects a second
    /// `swiftSettings:` on the same call — so equal counts leave no target
    /// without one.
    private static let constantName = "strictSwiftSettings"

    /// `.treatAllWarnings(as:)` does not exist below this. The alternative
    /// under an older tools version is `.unsafeFlags(["-warnings-as-errors"])`,
    /// which SwiftPM refuses to let another package depend on — and these
    /// packages depend on each other by path.
    private static let minimumToolsVersion = (major: 6, minor: 2)

    /// Every target kind that compiles Swift. `.binaryTarget` and
    /// `.systemLibrary` accept no settings and are deliberately absent.
    private static let targetKinds = [".target(", ".testTarget(", ".executableTarget("]

    static func faults(in manifest: String) -> [String] {
        // The tools version is itself a comment, so it is read before they go.
        toolsVersionFaults(manifest) + settingsFaults(withoutComments(manifest))
    }

    private static func toolsVersionFaults(_ manifest: String) -> [String] {
        let first = manifest.split(separator: "\n", omittingEmptySubsequences: false).first ?? ""
        guard let match = first.firstMatch(of: #/swift-tools-version:\s*(\d+)\.(\d+)/#),
            let major = Int(match.1), let minor = Int(match.2)
        else {
            return ["names no `// swift-tools-version:` on its first line"]
        }
        guard (major, minor) >= (minimumToolsVersion.major, minimumToolsVersion.minor) else {
            return [
                "declares swift-tools-version \(major).\(minor), below the "
                    + "\(minimumToolsVersion.major).\(minimumToolsVersion.minor) "
                    + "`.treatAllWarnings(as:)` needs"
            ]
        }
        return []
    }

    private static func settingsFaults(_ code: String) -> [String] {
        let lists = code.ranges(of: "[SwiftSetting]").count
        let arguments = code.ranges(of: "swiftSettings:").count
        let strict = code.ranges(of: "swiftSettings: \(constantName)").count
        let targets = targetKinds.reduce(0) { $0 + code.ranges(of: $1).count }

        var faults: [String] = []
        if targets == 0 {
            faults.append("declares no target, so nothing here was checked")
        }
        if lists != 1 || !code.contains("let \(constantName): [SwiftSetting]") {
            faults.append(
                "declares \(lists) `[SwiftSetting]` list(s), not the one named `\(constantName)`"
            )
        }
        if !code.contains(".treatAllWarnings(as: .error)") {
            faults.append("`\(constantName)` does not carry `.treatAllWarnings(as: .error)`")
        }
        if arguments != targets || strict != targets {
            faults.append(
                "has \(targets) target(s), \(arguments) `swiftSettings:` argument(s) and "
                    + "\(strict) of them passing `\(constantName)`"
            )
        }
        return faults
    }

    /// `//` to end of line, unless it falls inside a string literal — a
    /// manifest declaring `url: "https://…"` carries one of those. Block
    /// comments need no handling: `.swift-format`'s `NoBlockComments` bans them
    /// tree-wide.
    private static func withoutComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(codeOnly)
            .joined(separator: "\n")
    }

    private static func codeOnly(_ line: Substring) -> Substring {
        var inString = false
        var escaped = false
        var previous: Character?
        for (offset, character) in line.enumerated() {
            if escaped {
                escaped = false
            } else if character == "\\", inString {
                escaped = true
            } else if character == "\"" {
                inString.toggle()
            } else if character == "/", !inString, previous == "/" {
                return line.prefix(offset - 1)
            }
            previous = character
        }
        return line
    }
}

/// Synthetic manifests, each one derived from the compliant one by the single
/// edit it is named for — so a fixture whose edit silently stopped matching
/// becomes a compliant manifest, and the expectation about it fails.
private enum ManifestFixture {
    static let compliant = """
        // swift-tools-version: 6.2
        import PackageDescription

        let strictSwiftSettings: [SwiftSetting] = [
            .swiftLanguageMode(.v6),
            .treatAllWarnings(as: .error),
        ]

        let package = Package(
            name: "Example",
            targets: [
                .target(name: "Example", swiftSettings: strictSwiftSettings),
                .testTarget(name: "ExampleTests", swiftSettings: strictSwiftSettings),
            ]
        )
        """

    static let oldToolsVersion = compliant.replacingOccurrences(
        of: "swift-tools-version: 6.2",
        with: "swift-tools-version: 6.0"
    )

    static let targetWithoutSettings = compliant.replacingOccurrences(
        of: ".testTarget(name: \"ExampleTests\", swiftSettings: strictSwiftSettings)",
        with: ".testTarget(name: \"ExampleTests\")"
    )

    static let warningsLeftAsWarnings = compliant.replacingOccurrences(
        of: ".treatAllWarnings(as: .error)",
        with: ".treatAllWarnings(as: .warning)"
    )

    static let settingOnlyInAComment = compliant.replacingOccurrences(
        of: "    .treatAllWarnings(as: .error),",
        with: "    // .treatAllWarnings(as: .error)"
    )
}
