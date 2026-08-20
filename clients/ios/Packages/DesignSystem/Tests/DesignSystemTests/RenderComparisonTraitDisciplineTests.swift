import Foundation
import Testing

/// This package's rule, enforced against every package's own `Tests/` —
/// `RenderComparisonTraitScanner` is the machinery and the fixtures proving
/// it detects a violation; this suite is which files it is applied to.
///
/// Reuses `TokenDisciplineScan.packagesRoot` and `TokenDisciplineScanner`'s
/// file walk rather than re-deriving them: the tree to scan and the question
/// of which files under it are hand-written Swift are already solved
/// correctly there, including the degenerate cases (a module whose manifest
/// moved, a source root that cannot be read) — see that suite. What this adds
/// is `Tests/` as the root instead of `Sources/`, since the rule this file
/// enforces is about test code, not the package's own.
@Suite("Render comparison trait discipline")
internal struct RenderComparisonTraitDisciplineTests {
    /// This scanner's own implementation and its unit tests, excluded from
    /// the real-tree scan below. Their string literals deliberately reproduce
    /// the exact shape a violation takes — a bare `"@Test("` marker string in
    /// the scanner itself, planted light/dark comparisons in its own test
    /// fixtures — so scanning them would make this suite permanently red
    /// rather than actually clean. `RenderComparisonTraitScannerTests` is
    /// where those fixtures are proven to be caught; this is not that proof,
    /// it is what a real, un-fixtured tree looks like.
    private static let ownFiles: Set<String> = [
        "RenderComparisonTraitScanner.swift",
        "RenderComparisonTraitScannerTests.swift",
        "RenderComparisonTraitDisciplineTests.swift",
    ]

    /// Every module's `Tests/` directory, discovered the same way
    /// `TokenDisciplineScan.scanModules` discovers `Sources/`: a directory
    /// qualifies by holding a `Package.swift`, not by being a directory, so
    /// SwiftPM's own `.build` tree under `Packages/` is never mistaken for a
    /// module.
    private static func moduleTestRoots(under packages: URL) throws -> [URL] {
        let candidates =
            try FileManager.default
            .contentsOfDirectory(
                at: packages, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
            )
            .sorted { $0.path < $1.path }
        return try candidates.filter { entry in
            do {
                _ = try FileManager.default.attributesOfItem(
                    atPath: entry.appending(path: "Package.swift").path)
                return true
            } catch {
                guard TokenDisciplineScanner.meansPathDoesNotExist(error) else { throw error }
                return false
            }
        }.map { $0.appending(path: "Tests") }
    }

    /// The actual guard: every `Packages/*/Tests` file that compares
    /// rendered output more than once mentions `.requiresCompiledColorCatalog`
    /// somewhere in it.
    ///
    /// This is the check `CompiledColorCatalogFloorTests` is not: that suite
    /// proves the trait behaves correctly where declared; this proves it was
    /// declared somewhere in a file that plainly needed it, including one
    /// nobody has written yet — see `RenderComparisonTraitScannerTests` for
    /// the planted violation this scan is proven to catch.
    @Test("every file that compares rendered output declares .requiresCompiledColorCatalog")
    func everyPackageTestTreeIsClean() throws {
        let packages = TokenDisciplineScan.packagesRoot
        let roots = try Self.moduleTestRoots(under: packages)
        try #require(
            !roots.isEmpty,
            "found no package Tests/ under \(packages.path) — the scan would pass vacuously"
        )

        var sawAnyFile = false
        var violations: [RenderComparisonTraitScanner.Violation] = []
        for root in roots {
            let files: [URL]
            do {
                files = try TokenDisciplineScanner.swiftFiles(under: root)
            } catch {
                guard TokenDisciplineScanner.meansPathDoesNotExist(error) else { throw error }
                continue
            }
            guard !files.isEmpty else { continue }
            sawAnyFile = true
            for file in files where !Self.ownFiles.contains(file.lastPathComponent) {
                let source = try String(contentsOf: file, encoding: .utf8)
                let relative = file.path.replacingOccurrences(
                    of: packages.path + "/", with: "")
                violations += RenderComparisonTraitScanner.violations(
                    inSource: source, file: relative)
            }
        }

        try #require(
            sawAnyFile,
            "scanned no test source at all under \(packages.path)/*/Tests — the scan would pass vacuously"
        )
        #expect(
            violations.isEmpty,
            "\n\(violations.map(\.description).joined(separator: "\n"))")
    }
}
