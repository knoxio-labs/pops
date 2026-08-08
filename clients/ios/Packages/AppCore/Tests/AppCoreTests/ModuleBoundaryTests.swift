import Foundation
import Testing

/// The dependency direction, asserted by reading the tree rather than by the
/// compiler. SwiftLint has no rule that can express "this module may not name
/// that one", and the compiler only refuses an import a manifest never declared
/// — it has nothing to say about a wrong edge being added to the manifest in
/// the first place. So this reads the sources.
@Suite("Module boundaries")
internal struct ModuleBoundaryTests {
    /// Packages allowed to name a concrete implementation of an `AppCore` seam,
    /// because they are the mechanism: `Auth` owns pairing, key material and the
    /// authenticating transport; `BFMClient` owns the generated types and the
    /// calls that carry them.
    private let implementationPackages: Set<String> = ["Auth", "BFMClient"]

    /// The modules the generated BFM client is written against. Naming one is
    /// how a generated type would reach a second module — the types themselves
    /// are `internal` to `BFMClient`, so the compiler already refuses the direct
    /// route, but nothing stops a feature importing `OpenAPIRuntime` and
    /// building its own client against the same contract.
    private let generatedClientRuntime: Set<String> = [
        "OpenAPIRuntime", "OpenAPIURLSession", "HTTPTypes",
    ]

    /// The package that owns the generated code, and the only one that may name
    /// any of the above.
    private let generatedClientPackage = "BFMClient"

    /// Every SPM dependency the app is allowed to resolve from outside this
    /// repo, by URL. Two, both Apple's, both there because a generated OpenAPI
    /// client does not compile without them.
    private let allowedExternalPackages: Set<String> = [
        "https://github.com/apple/swift-openapi-runtime",
        "https://github.com/apple/swift-openapi-urlsession",
    ]

    @Test("the scan finds the packages it is asserting about")
    func scanIsWiredUp() throws {
        let packages = try packageNames()

        #expect(packages.contains("AppCore"))
        #expect(packages.contains("FeatureTransactions"))
        #expect(packages.isSuperset(of: implementationPackages))
        for package in packages {
            #expect(!(try sourceFiles(inPackage: package).isEmpty), "\(package) has no sources")
        }
    }

    @Test("no package imports a concrete implementation unless it is one")
    func noPackageImportsAConcreteImplementation() throws {
        for package in try packageNames() where !implementationPackages.contains(package) {
            for file in try sourceFiles(inPackage: package) {
                let forbidden = try importedModules(in: file).intersection(implementationPackages)
                #expect(
                    forbidden.isEmpty,
                    "\(package)/\(file.lastPathComponent) imports \(forbidden.sorted().joined(separator: ", "))"
                )
            }
        }
    }

    @Test("no package declares a dependency on a concrete implementation unless it is one")
    func noPackageDependsOnAConcreteImplementation() throws {
        for package in try packageNames() where !implementationPackages.contains(package) {
            let forbidden = try declaredDependencies(ofPackage: package)
                .intersection(implementationPackages)
            #expect(
                forbidden.isEmpty,
                "\(package)/Package.swift depends on \(forbidden.sorted().joined(separator: ", "))"
            )
        }
    }

    @Test("no feature imports another feature")
    func noFeatureImportsAnotherFeature() throws {
        for package in try packageNames() where package.hasPrefix("Feature") {
            for file in try sourceFiles(inPackage: package) {
                let otherFeatures = try importedModules(in: file)
                    .filter { $0.hasPrefix("Feature") && $0 != package }
                #expect(
                    otherFeatures.isEmpty,
                    "\(package)/\(file.lastPathComponent) imports \(otherFeatures.sorted().joined(separator: ", "))"
                )
            }
        }
    }

    /// The import half of "no generated type appears outside `BFMClient`".
    ///
    /// Its `Generated/` sources are emitted `internal`, which already makes the
    /// types unnameable elsewhere. This is about the module that would have to
    /// be imported first: a second module reaching for `OpenAPIRuntime` is a
    /// second client being built against the same contract, outside the one
    /// directory the regenerate-and-diff gate covers.
    @Test("only the package that owns the generated code names its runtime")
    func onlyOnePackageNamesTheGeneratedClientRuntime() throws {
        // The owning package must name them, or every assertion below holds for
        // a tree where the client was deleted.
        let owned = try sourceFiles(inPackage: generatedClientPackage)
            .reduce(into: Set<String>()) { $0.formUnion(try importedModules(in: $1)) }
        #expect(!owned.isDisjoint(with: generatedClientRuntime))

        let elsewhere =
            try packageNames().filter { $0 != generatedClientPackage }
            .flatMap { try sourceFiles(inPackage: $0) } + swiftFiles(under: appDirectory)
        for file in elsewhere {
            let forbidden = try importedModules(in: file).intersection(generatedClientRuntime)
            #expect(
                forbidden.isEmpty,
                "\(file.lastPathComponent) imports \(forbidden.sorted().joined(separator: ", "))"
            )
        }
    }

    /// The manifest half of the same rule, and the app's entire external
    /// dependency surface in one assertion.
    ///
    /// Two things are being held at once. Only `BFMClient` may reach outside the
    /// repo at all — every other package depends on its siblings by path. And
    /// the set it reaches for is exactly these two: notably NOT
    /// `swift-openapi-generator`, which lives in `Tools/OpenAPIGenerator` so
    /// that a code generator and its four transitive dependencies stay out of an
    /// iPhone app's build graph. Moving it back here is a one-line edit to a
    /// manifest that builds, tests and lints clean.
    @Test("the app links no external package but the two it is allowed")
    func externalDependenciesAreTheAllowedOnes() throws {
        var declared: Set<String> = []
        for package in try packageNames() {
            let urls = try externalPackageURLs(ofPackage: package)
            declared.formUnion(urls)
            let expected = package == generatedClientPackage ? allowedExternalPackages : []
            let unexpected = urls.subtracting(expected)
            #expect(
                unexpected.isEmpty,
                "\(package)/Package.swift depends on \(unexpected.sorted().joined(separator: ", "))"
            )
        }

        // The allowlist is a description of the tree, not an aspiration: if
        // `BFMClient` stopped declaring these, every check above would pass on a
        // tree with no generated client in it.
        #expect(declared == allowedExternalPackages)
    }

    /// Everything that ships: every package's `Sources`, and the app target.
    /// Only a `Tests` tree may reach for the fakes.
    @Test("fakes stay out of shipping code")
    func fakesAreTestOnly() throws {
        let fakes = try testSupportModules()
        // The scan has to find every one of them, or this passes vacuously the
        // moment the naming convention it infers from stops holding.
        #expect(fakes.contains("AppCoreFakes"))
        #expect(fakes.contains("AuthTestSupport"))

        let shipping =
            try packageNames().flatMap { try sourceFiles(inPackage: $0) }
            + swiftFiles(under: appDirectory)
        #expect(!shipping.isEmpty)

        for file in shipping where !fakes.contains(where: { file.path.contains("/Sources/\($0)/") })
        {
            let forbidden = try importedModules(in: file).intersection(fakes)
            #expect(
                forbidden.isEmpty,
                "\(file.lastPathComponent) imports \(forbidden.sorted().joined(separator: ", ")) outside a test target"
            )
        }
    }
}

extension ModuleBoundaryTests {
    /// `.../Packages/AppCore/Tests/AppCoreTests/ModuleBoundaryTests.swift`
    private var packagesDirectory: URL {
        URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func packageNames() throws -> Set<String> {
        let contents = try FileManager.default.contentsOfDirectory(
            at: packagesDirectory,
            includingPropertiesForKeys: [.isDirectoryKey]
        )
        return Set(
            contents
                .filter { (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true }
                .map(\.lastPathComponent)
        )
    }

    /// The app target, the one shipping tree that is not a package.
    private var appDirectory: URL {
        packagesDirectory.deletingLastPathComponent().appending(path: "App")
    }

    /// Every module that exists only so tests have something to substitute,
    /// discovered by name rather than listed. A hand-maintained list is written
    /// by whoever owns this guard and grown by whoever adds a fake, and those
    /// are not the same person — the second such module arrived from a
    /// different package and would have gone unguarded.
    private func testSupportModules() throws -> Set<String> {
        var found: Set<String> = []
        for package in try packageNames() {
            let sources = packagesDirectory.appending(path: package).appending(path: "Sources")
            let entries =
                (try? FileManager.default.contentsOfDirectory(
                    at: sources,
                    includingPropertiesForKeys: [.isDirectoryKey]
                )) ?? []
            for entry in entries
            where (try? entry.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true {
                let module = entry.lastPathComponent
                if module.hasSuffix("Fakes") || module.hasSuffix("TestSupport") {
                    found.insert(module)
                }
            }
        }
        return found
    }

    private func sourceFiles(inPackage package: String) throws -> [URL] {
        swiftFiles(under: packagesDirectory.appending(path: package).appending(path: "Sources"))
    }

    private func swiftFiles(under directory: URL) -> [URL] {
        guard
            let enumerator = FileManager.default.enumerator(
                at: directory, includingPropertiesForKeys: nil)
        else { return [] }
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func manifestSource(ofPackage package: String) throws -> String {
        let manifest = packagesDirectory.appending(path: package).appending(path: "Package.swift")
        return try String(contentsOf: manifest, encoding: .utf8)
    }

    /// Every remote package URL the manifest declares. Matched on the `url:`
    /// label rather than on the whole `.package(...)` call, so a line break
    /// between the two — which is how a formatter renders a long dependency
    /// list — does not hide an edge from this. Prose in a comment cannot match:
    /// the label has to be there.
    private func externalPackageURLs(ofPackage package: String) throws -> Set<String> {
        let source = try manifestSource(ofPackage: package)
        return Set(source.matches(of: #/url:\s*"([^"]+)"/#).map { String($0.1) })
    }

    /// Any sibling-package path the manifest mentions, however the `.package`
    /// call is spelled — matching the whole call shape would let a `name:`
    /// argument or a line break slip an edge past this.
    private func declaredDependencies(ofPackage package: String) throws -> Set<String> {
        let source = try manifestSource(ofPackage: package)
        return Set(source.matches(of: #/"\.\./([A-Za-z_][A-Za-z0-9_]*)"/#).map { String($0.1) })
    }

    /// A line scan rather than a parse: an `import` inside a block comment or a
    /// string literal would be a false positive, and neither has ever appeared
    /// in a Swift file worth writing.
    private func importedModules(in file: URL) throws -> Set<String> {
        let source = try String(contentsOf: file, encoding: .utf8)
        // Extended form: literal whitespace is ignored, so every space that
        // matters is spelled `\s`. Same pattern as the one line it replaces.
        let pattern =
            #/
            ^\s*
            (?:@[A-Za-z_]+\s+)?
            import\s+
            (?:struct|class|enum|protocol|func|var|let|typealias)?\s*
            ([A-Za-z_][A-Za-z0-9_]*)
        /#
        return Set(
            source
                .split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .compactMap { try? pattern.firstMatch(in: String($0)) }
                .map { String($0.1) }
        )
    }
}
