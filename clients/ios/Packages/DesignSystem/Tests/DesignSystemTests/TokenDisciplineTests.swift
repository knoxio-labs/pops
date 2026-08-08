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
/// which files they are applied to.
@Suite("Token discipline")
internal struct TokenDisciplineTests {
    private static let packagesRoot = URL(filePath: #filePath)
        .deletingLastPathComponent()  // DesignSystemTests
        .deletingLastPathComponent()  // Tests
        .deletingLastPathComponent()  // DesignSystem
        .deletingLastPathComponent()  // Packages

    /// What one pass over a `Packages` tree found. `emptyRoots` is carried
    /// rather than folded into a count, because a module whose `Sources` yielded
    /// nothing and a module with nothing wrong in it produce the identical empty
    /// violation list.
    private struct ModuleScan {
        let roots: [URL]
        let emptyRoots: [URL]
        let violations: [TokenDisciplineScanner.Violation]
    }

    /// Scans every module under a `Packages` directory, discovering them rather
    /// than working from a list: a module added tomorrow is in scope without
    /// anyone remembering to add it, which is the failure this suite exists to
    /// close.
    ///
    /// A directory qualifies by holding a `Package.swift`, not by being a
    /// directory — `Packages/` also accumulates SwiftPM's `.build` trees.
    private static func scanModules(under packages: URL) throws -> ModuleScan {
        let roots =
            try FileManager.default
            .contentsOfDirectory(at: packages, includingPropertiesForKeys: nil)
            .filter {
                FileManager.default.fileExists(atPath: $0.appending(path: "Package.swift").path)
            }
            .map { $0.appending(path: "Sources") }
            .sorted { $0.path < $1.path }

        var emptyRoots: [URL] = []
        var violations: [TokenDisciplineScanner.Violation] = []
        for root in roots {
            let files = (try? TokenDisciplineScanner.swiftFiles(under: root)) ?? []
            if files.isEmpty {
                emptyRoots.append(root)
                continue
            }
            violations += try files.flatMap {
                try TokenDisciplineScanner.violations(in: $0, relativeTo: packages)
            }
        }
        return ModuleScan(roots: roots, emptyRoots: emptyRoots, violations: violations)
    }

    @Test("no module under Packages/ names a colour or a metric outside the token layer")
    func everyModuleIsClean() throws {
        let scan = try Self.scanModules(under: Self.packagesRoot)

        try #require(
            !scan.roots.isEmpty,
            "found no package under \(Self.packagesRoot.path) — the scan would pass vacuously")
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

    @Test("the scan reaches a module that is not this one, and reports where")
    func siblingModuleIsScanned() throws {
        let packages = try Self.makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: packages) }
        try Self.plantModule(named: "DesignSystem", in: packages, source: "let ok = true\n")
        try Self.plantModule(named: "FeatureFake", in: packages, source: "    .padding(16)\n")
        // SwiftPM's build tree is a directory under `Packages` too, and it is
        // full of checked-out dependency sources nobody here wrote.
        try FileManager.default.createDirectory(
            at: packages.appending(path: ".build"), withIntermediateDirectories: true)

        let scan = try Self.scanModules(under: packages)

        #expect(
            scan.roots.map { $0.deletingLastPathComponent().lastPathComponent }
                == ["DesignSystem", "FeatureFake"])
        #expect(scan.emptyRoots.isEmpty)
        #expect(scan.violations.map(\.file) == ["FeatureFake/Sources/FeatureFake/Source.swift"])
        #expect(scan.violations.map(\.rule) == ["numeric metric literal"])
    }

    @Test("a module whose sources went missing is reported, not silently skipped")
    func moduleWithNoSourcesIsReported() throws {
        let packages = try Self.makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: packages) }
        try Self.plantModule(named: "Renamed", in: packages, source: nil)

        let scan = try Self.scanModules(under: packages)

        #expect(
            scan.emptyRoots.map { $0.deletingLastPathComponent().lastPathComponent } == ["Renamed"])
    }

    @Test("generated sources are out of scope, and only because they are generated")
    func generatedSourcesAreSkipped() throws {
        let tree = try Self.makeTemporaryDirectory()
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

    /// Symlinks resolved, because `FileManager` hands back resolved paths and a
    /// violation's reported path is the scanned path with its root prefix
    /// stripped — an unresolved root strips nothing (`/var` vs `/private/var`)
    /// and every path in the report comes out absolute.
    private static func makeTemporaryDirectory() throws -> URL {
        let directory = URL(filePath: NSTemporaryDirectory())
            .appending(path: "token-discipline-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.resolvingSymlinksInPath()
    }

    /// A miniature of one real module — a `Package.swift` and a `Sources` tree —
    /// so what is under test is the discovery this suite actually runs and not a
    /// restatement of it. `source: nil` plants the module a rename leaves behind.
    private static func plantModule(named name: String, in packages: URL, source: String?) throws {
        let module = packages.appending(path: name)
        try FileManager.default.createDirectory(at: module, withIntermediateDirectories: true)
        try "// swift-tools-version: 6.0\n"
            .write(to: module.appending(path: "Package.swift"), atomically: true, encoding: .utf8)

        guard let source else { return }
        let sources = module.appending(path: "Sources/\(name)")
        try FileManager.default.createDirectory(at: sources, withIntermediateDirectories: true)
        try source.write(
            to: sources.appending(path: "Source.swift"), atomically: true, encoding: .utf8)
    }
}
