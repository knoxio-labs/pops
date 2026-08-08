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

    /// What one pass over a `Packages` tree found. Everything but `violations`
    /// exists because the ways this scan can cover less than it claims all look
    /// identical from the violation list: no modules, a module with no sources,
    /// and a directory that was never recognised as a module all produce zero
    /// violations, which is the same answer as a clean tree.
    private struct ModuleScan {
        let roots: [URL]
        let emptyRoots: [URL]
        let unrecognised: [URL]
        let violations: [TokenDisciplineScanner.Violation]
    }

    /// Scans every module under a `Packages` directory, discovering them rather
    /// than working from a list: a module added tomorrow is in scope without
    /// anyone remembering to add it, which is the failure this suite exists to
    /// close.
    ///
    /// A directory qualifies by holding a `Package.swift`, not by being a
    /// directory — `Packages/` also accumulates SwiftPM's `.build` trees.
    /// A visible directory that does *not* qualify comes back as `unrecognised`
    /// rather than being passed over: a module whose manifest was renamed away
    /// drops silently out of scope, and silence is what this scan cannot afford.
    private static func scanModules(under packages: URL) throws -> ModuleScan {
        // Every visible entry, classified into exactly one of the two buckets
        // and never filtered out. An earlier version asked each entry whether
        // it was a directory before asking about `Package.swift`, which meant
        // a metadata failure on that first, unrelated question dropped the
        // entry from `roots` AND from `unrecognised` alike — the bucket that
        // exists to notice things going missing could not notice this one.
        // The question that actually matters, "does it hold a `Package.swift`",
        // still has to ask the filesystem and can still fail; what changed is
        // that failing now means throwing, not returning a false "no".
        let candidates =
            try FileManager.default
            .contentsOfDirectory(
                at: packages, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
            )
            .sorted { $0.path < $1.path }

        // Throwing for the same reason the `Sources` check below does:
        // `fileExists` cannot tell "no `Package.swift`" from "couldn't check
        // — permission or IO fault on the entry itself", and the second one
        // has to fail loudly rather than land a real module in
        // `unrecognised` as if it had been looked at and found wanting.
        let isModule = { (entry: URL) throws -> Bool in
            do {
                _ = try FileManager.default.attributesOfItem(
                    atPath: entry.appending(path: "Package.swift").path)
                return true
            } catch {
                guard TokenDisciplineScanner.meansPathDoesNotExist(error) else { throw error }
                return false
            }
        }
        let roots = try candidates.filter(isModule).map { $0.appending(path: "Sources") }
        let unrecognised = try candidates.filter { try !isModule($0) }

        var emptyRoots: [URL] = []
        var violations: [TokenDisciplineScanner.Violation] = []
        for root in roots {
            // An absent `Sources` is the only failure *this check* launders
            // into "this module contributed nothing" — a `Sources` that
            // exists but holds no hand-written Swift (nothing, or only
            // `Generated` code) is the other, legitimate route to
            // `emptyRoots`, handled by the `files.isEmpty` check below.
            // Anything else the filesystem objects to here is a real error
            // and has to arrive as one, or the report says a module is empty
            // when what happened was a permission or an IO fault.
            //
            // `fileExists(atPath:)` cannot draw that line — it returns `false`
            // for a permission or IO failure exactly as it does for "missing",
            // which is the same misclassification `try?` produced, just
            // without the keyword. `attributesOfItem` throws instead, and only
            // an absent path is what this scan is allowed to treat as empty;
            // every other error propagates as itself.
            do {
                _ = try FileManager.default.attributesOfItem(atPath: root.path)
            } catch {
                guard TokenDisciplineScanner.meansPathDoesNotExist(error) else { throw error }
                emptyRoots.append(root)
                continue
            }
            let files = try TokenDisciplineScanner.swiftFiles(under: root)
            if files.isEmpty {
                emptyRoots.append(root)
                continue
            }
            violations += try files.flatMap {
                try TokenDisciplineScanner.violations(in: $0, relativeTo: packages)
            }
        }
        return ModuleScan(
            roots: roots, emptyRoots: emptyRoots, unrecognised: unrecognised,
            violations: violations)
    }

    @Test(
        "no module under Packages/ names a colour, a metric or a font size outside the token layer"
    )
    func everyModuleIsClean() throws {
        let scan = try Self.scanModules(under: Self.packagesRoot)

        try #require(
            !scan.roots.isEmpty,
            "found no package under \(Self.packagesRoot.path) — the scan would pass vacuously")
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
        #expect(scan.unrecognised.isEmpty)
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

    /// The other half of the distinction `moduleWithNoSourcesIsReported`
    /// checks: a module directory that genuinely cannot be read is not the
    /// same event as one that was never there, and reporting both as "empty"
    /// is exactly the failure this suite exists to catch — silence dressed
    /// up as a clean scan.
    @Test("a module whose sources cannot be read fails loudly, not as an empty root")
    func unreadableSourcesPropagatesTheRealError() throws {
        let packages = try Self.makeTemporaryDirectory()
        let module = packages.appending(path: "Blocked")
        defer {
            try? FileManager.default.setAttributes(
                [.posixPermissions: 0o755], ofItemAtPath: module.path)
            try? FileManager.default.removeItem(at: packages)
        }
        try Self.plantModule(named: "Blocked", in: packages, source: nil)
        // No search permission on the module directory means `stat`-ing its
        // `Sources` child fails with "permission denied", not "no such
        // file" — the distinction the fix under test has to preserve.
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o000], ofItemAtPath: module.path)

        #expect(throws: (any Error).self) {
            try Self.scanModules(under: packages)
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
        let packages = try Self.makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: packages) }
        try Self.plantModule(named: "Module", in: packages, source: "let ok = true\n")
        try FileManager.default.createDirectory(
            at: packages.appending(path: "NotAModule"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(
            at: packages.appending(path: ".hidden"), withIntermediateDirectories: true)
        try "stray\n"
            .write(to: packages.appending(path: "loose.txt"), atomically: true, encoding: .utf8)

        let scan = try Self.scanModules(under: packages)

        let classified =
            Set(scan.roots.map { $0.deletingLastPathComponent().lastPathComponent })
            .union(scan.unrecognised.map(\.lastPathComponent))
        #expect(classified == ["Module", "NotAModule", "loose.txt"])
        #expect(scan.roots.count + scan.unrecognised.count == classified.count)
    }

    @Test("a module whose manifest went missing is reported, not quietly dropped")
    func directoryWithoutManifestIsReported() throws {
        let packages = try Self.makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: packages) }
        try Self.plantModule(named: "Kept", in: packages, source: "let ok = true\n")
        let orphan = packages.appending(path: "Orphan/Sources/Orphan")
        try FileManager.default.createDirectory(at: orphan, withIntermediateDirectories: true)
        try "    .padding(16)\n"
            .write(to: orphan.appending(path: "Source.swift"), atomically: true, encoding: .utf8)

        let scan = try Self.scanModules(under: packages)

        #expect(scan.unrecognised.map(\.lastPathComponent) == ["Orphan"])
        // The point of reporting it: its violation is invisible to the scan.
        #expect(scan.violations.isEmpty)
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
