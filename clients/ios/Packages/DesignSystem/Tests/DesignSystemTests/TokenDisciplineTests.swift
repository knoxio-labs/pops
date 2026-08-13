import Foundation
import Testing

/// This package's rule, enforced against every module that has to obey it.
///
/// It lives here because the rule is this package's — a colour or a gap named
/// anywhere else is a token this package failed to supply. It reaches the other
/// modules because the check is a file scan: `TokenDisciplineScanner` reads
/// `.swift` files off disk and never imports what it judges, so the test-target
/// boundary that stops `DesignSystemTests` from *linking* a feature module
/// stops nothing here.
///
/// What the rules are is `TokenDisciplineScannerTests`; this suite is about
/// which files they are applied to. The scanning machinery and the fixtures are
/// `TokenDisciplineScan`, so what is left here is the list of claims.
@Suite("Token discipline")
internal struct TokenDisciplineTests {
    @Test(
        "no module under Packages/ names a colour, a metric or a font size outside the token layer"
    )
    func everyModuleIsClean() throws {
        let packages = TokenDisciplineScan.packagesRoot
        let scan = try TokenDisciplineScan.scanModules(under: packages)

        try #require(
            !scan.roots.isEmpty,
            "found no package under \(packages.path) — the scan would pass vacuously")
        try #require(
            scan.unrecognised.isEmpty,
            """
            these entries under Packages/ hold no Package.swift, so the scan \
            never looked inside them: \
            \(scan.unrecognised.map(\.lastPathComponent).joined(separator: ", "))
            """)
        // Per module rather than over the total: with five modules and one of
        // them renamed, a total taken across all of them is still large and
        // still green while an entire module went unscanned.
        try #require(
            scan.emptyRoots.isEmpty,
            """
            these modules contributed no Swift source, so nothing scanned them: \
            \(scan.emptyRoots.map(\.path).joined(separator: ", "))
            """)

        #expect(
            scan.violations.isEmpty,
            "\n\(scan.violations.map(\.description).joined(separator: "\n"))")
    }

    @Test("App/ names no colour, metric or font size outside the token layer either")
    func theAppTargetIsClean() throws {
        let app = TokenDisciplineScan.appRoot
        let scan = try TokenDisciplineScan.scanSourceRoot(
            app, relativeTo: TokenDisciplineScan.clientRoot)

        // The same non-empty guard the module roots get, and for the same
        // reason: `App/` holding no Swift means it moved, not that it is clean.
        try #require(
            !scan.isEmpty, "found no Swift under \(app.path) — the scan would pass vacuously")

        #expect(
            scan.violations.isEmpty,
            "\n\(scan.violations.map(\.description).joined(separator: "\n"))")
    }

    @Test("the scan reaches a module that is not this one, and reports where")
    func siblingModuleIsScanned() throws {
        let packages = try TokenDisciplineScan.makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: packages) }
        try TokenDisciplineScan.plantModule(
            named: "DesignSystem", in: packages, source: "let ok = true\n")
        try TokenDisciplineScan.plantModule(
            named: "FeatureFake", in: packages, source: "    .padding(16)\n")
        // SwiftPM's build tree is a directory under `Packages` too, and it is
        // full of checked-out dependency sources nobody here wrote.
        try FileManager.default.createDirectory(
            at: packages.appending(path: ".build"), withIntermediateDirectories: true)

        let scan = try TokenDisciplineScan.scanModules(under: packages)

        #expect(
            scan.roots.map { $0.deletingLastPathComponent().lastPathComponent }
                == ["DesignSystem", "FeatureFake"])
        #expect(scan.emptyRoots.isEmpty)
        #expect(scan.unrecognised.isEmpty)
        #expect(scan.violations.map(\.file) == ["FeatureFake/Sources/FeatureFake/Source.swift"])
        #expect(scan.violations.map(\.rule) == ["numeric metric literal"])
    }

    @Test("a module whose sources went missing is reported, not silently skipped")
    func moduleWithNoSourcesIsReported() throws {
        let packages = try TokenDisciplineScan.makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: packages) }
        try TokenDisciplineScan.plantModule(named: "Renamed", in: packages, source: nil)

        let scan = try TokenDisciplineScan.scanModules(under: packages)

        #expect(
            scan.emptyRoots.map { $0.deletingLastPathComponent().lastPathComponent } == ["Renamed"])
    }

    /// The other half of the distinction `moduleWithNoSourcesIsReported`
    /// checks: a module directory that genuinely cannot be read is not the
    /// same event as one that was never there, and reporting both as "empty"
    /// is exactly the failure this suite exists to catch — silence dressed
    /// up as a clean scan.
    @Test("a module whose sources cannot be read fails loudly, not as an empty root")
    func unreadableSourcesPropagatesTheRealError() throws {
        let packages = try TokenDisciplineScan.makeTemporaryDirectory()
        let module = packages.appending(path: "Blocked")
        defer {
            try? FileManager.default.setAttributes(
                [.posixPermissions: 0o755], ofItemAtPath: module.path)
            try? FileManager.default.removeItem(at: packages)
        }
        try TokenDisciplineScan.plantModule(named: "Blocked", in: packages, source: nil)
        // No search permission on the module directory means `stat`-ing its
        // `Sources` child fails with "permission denied", not "no such
        // file" — the distinction the fix under test has to preserve.
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o000], ofItemAtPath: module.path)

        #expect(throws: (any Error).self) {
            try TokenDisciplineScan.scanModules(under: packages)
        }
    }

    /// The property the two buckets exist to have, stated once so it survives
    /// whichever `FileManager` call gets rewritten next: an entry under
    /// `Packages/` is either a module the scan looked inside or a directory it
    /// reports as unrecognised, and there is no third outcome. A classification
    /// step that can drop an entry silently puts a module out of scope while
    /// every assertion in this suite still passes.
    @Test("every visible entry under Packages/ lands in exactly one bucket")
    func classificationLosesNothing() throws {
        let packages = try TokenDisciplineScan.makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: packages) }
        try TokenDisciplineScan.plantModule(
            named: "Module", in: packages, source: "let ok = true\n")
        try FileManager.default.createDirectory(
            at: packages.appending(path: "NotAModule"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(
            at: packages.appending(path: ".hidden"), withIntermediateDirectories: true)
        try "stray\n"
            .write(to: packages.appending(path: "loose.txt"), atomically: true, encoding: .utf8)

        let scan = try TokenDisciplineScan.scanModules(under: packages)

        let classified =
            Set(scan.roots.map { $0.deletingLastPathComponent().lastPathComponent })
            .union(scan.unrecognised.map(\.lastPathComponent))
        #expect(classified == ["Module", "NotAModule", "loose.txt"])
        #expect(scan.roots.count + scan.unrecognised.count == classified.count)
    }

    @Test("a module whose manifest went missing is reported, not quietly dropped")
    func directoryWithoutManifestIsReported() throws {
        let packages = try TokenDisciplineScan.makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: packages) }
        try TokenDisciplineScan.plantModule(named: "Kept", in: packages, source: "let ok = true\n")
        let orphan = packages.appending(path: "Orphan/Sources/Orphan")
        try FileManager.default.createDirectory(at: orphan, withIntermediateDirectories: true)
        try "    .padding(16)\n"
            .write(to: orphan.appending(path: "Source.swift"), atomically: true, encoding: .utf8)

        let scan = try TokenDisciplineScan.scanModules(under: packages)

        #expect(scan.unrecognised.map(\.lastPathComponent) == ["Orphan"])
        // The point of reporting it: its violation is invisible to the scan.
        #expect(scan.violations.isEmpty)
    }

    @Test("generated sources are out of scope, and only because they are generated")
    func generatedSourcesAreSkipped() throws {
        let tree = try TokenDisciplineScan.makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: tree) }
        let generated = tree.appending(path: TokenDisciplineScanner.generatedDirectoryName)
        try FileManager.default.createDirectory(at: generated, withIntermediateDirectories: true)

        let source = "let tint = Color.red\n"
        try source.write(to: tree.appending(path: "Hand.swift"), atomically: true, encoding: .utf8)
        try source.write(
            to: generated.appending(path: "Types.swift"), atomically: true, encoding: .utf8)

        let scanned = try TokenDisciplineScanner.swiftFiles(under: tree)

        #expect(scanned.map(\.lastPathComponent) == ["Hand.swift"])
    }
}
