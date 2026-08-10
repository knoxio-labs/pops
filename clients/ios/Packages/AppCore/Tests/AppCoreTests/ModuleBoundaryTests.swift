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
    /// middleware that attaches a token; `BFMClient` owns the generated types
    /// and the calls that carry them.
    private let implementationPackages: Set<String> = ["Auth", "BFMClient"]

    /// The modules the generated BFM client is written against. Naming one is
    /// how a generated type would reach a second module — the types themselves
    /// are `internal` to `BFMClient`, so the compiler already refuses the direct
    /// route, but nothing stops a feature importing `OpenAPIRuntime` and
    /// building its own client against the same contract.
    private let generatedClientRuntime: Set<String> = [
        "OpenAPIRuntime", "OpenAPIURLSession", "HTTPTypes",
    ]

    /// The package that owns the generated code.
    private let generatedClientPackage = "BFMClient"

    /// Which of the runtime modules each package may name. Absent means none,
    /// which is every package but these two.
    ///
    /// `Auth` is the exception and the shape of the exception is the point.
    /// `AuthenticatingMiddleware` conforms to `OpenAPIRuntime`'s
    /// `ClientMiddleware` and speaks `HTTPTypes`' request and response — the
    /// *transport* vocabulary — which is what attaching a credential and
    /// retrying a request needs. It does not name `OpenAPIURLSession`, and that
    /// omission is not incidental: that module is the one that actually
    /// performs HTTP, and keeping it to `BFMClient` is the checkable form of
    /// "a caller does not get to choose its own timeouts, redirect policy or
    /// TLS behaviour". The rule this narrows was never really "one importer";
    /// it was "one client built against the contract", and that still holds —
    /// the generated types remain `internal` to `BFMClient` and nothing in
    /// `Auth` can name one.
    private let clientRuntimeAllowances: [String: Set<String>] = [
        "BFMClient": ["OpenAPIRuntime", "OpenAPIURLSession", "HTTPTypes"],
        "Auth": ["OpenAPIRuntime", "HTTPTypes"],
    ]

    /// Every SPM dependency the app is allowed to resolve from outside this
    /// repo, per package. All Apple's, all there because a generated OpenAPI
    /// client does not compile without them.
    private let allowedExternalPackages: [String: Set<String>] = [
        "BFMClient": [
            "https://github.com/apple/swift-openapi-runtime",
            "https://github.com/apple/swift-openapi-urlsession",
        ],
        "Auth": ["https://github.com/apple/swift-openapi-runtime"],
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
    /// be imported first: a package reaching for `OpenAPIRuntime` with no
    /// entry below is a second client being built against the same contract,
    /// outside the one directory the regenerate-and-diff gate covers.
    @Test("only the packages listed may name the generated client's runtime")
    func onlyAllowedPackagesNameTheGeneratedClientRuntime() throws {
        // The owning package must name them, or every assertion below holds for
        // a tree where the client was deleted.
        let owned = try sourceFiles(inPackage: generatedClientPackage)
            .reduce(into: Set<String>()) { $0.formUnion(try importedModules(in: $1)) }
        #expect(!owned.isDisjoint(with: generatedClientRuntime))

        for package in try packageNames() {
            let allowed = clientRuntimeAllowances[package] ?? []
            for file in try sourceFiles(inPackage: package) {
                let forbidden = try importedModules(in: file)
                    .intersection(generatedClientRuntime)
                    .subtracting(allowed)
                #expect(
                    forbidden.isEmpty,
                    "\(package)/\(file.lastPathComponent) imports \(forbidden.sorted().joined(separator: ", "))"
                )
            }
        }
        for file in swiftFiles(under: appDirectory) {
            let forbidden = try importedModules(in: file).intersection(generatedClientRuntime)
            #expect(
                forbidden.isEmpty,
                "App/\(file.lastPathComponent) imports \(forbidden.sorted().joined(separator: ", "))"
            )
        }
    }

    /// The half of the rule above that is worth stating on its own, because it
    /// is the one a well-meaning change would undo.
    ///
    /// `OpenAPIURLSession` is the module that performs HTTP. Whoever names it
    /// chooses the timeouts, the redirect policy and the TLS behaviour, and
    /// `BFMClient` keeps that decision — which is why its transport-injecting
    /// initialiser is `internal` and why the seam it hands out instead is a
    /// middleware. A second importer would be that decision moving to a call
    /// site, quietly, in a build that compiles.
    @Test("exactly one package performs HTTP")
    func onlyTheClientPackageNamesTheHTTPTransport() throws {
        var importers: Set<String> = []
        for package in try packageNames() {
            for file in try sourceFiles(inPackage: package)
            where try importedModules(in: file).contains("OpenAPIURLSession") {
                importers.insert(package)
            }
        }

        #expect(importers == [generatedClientPackage])
    }

    /// The manifest half of the same rule, and the app's entire external
    /// dependency surface in one assertion.
    ///
    /// Two things are being held at once. Only the packages below may reach
    /// outside the repo at all — every other one depends on its siblings by
    /// path. And the set they reach for is exactly these: notably NOT
    /// `swift-openapi-generator`, which lives in `Tools/OpenAPIGenerator` so
    /// that a code generator and its four transitive dependencies stay out of an
    /// iPhone app's build graph. Moving it back here is a one-line edit to a
    /// manifest that builds, tests and lints clean.
    @Test("the app links no external package but the ones it is allowed")
    func externalDependenciesAreTheAllowedOnes() throws {
        var declared: Set<String> = []
        for package in try packageNames() {
            let urls = try externalPackageURLs(ofPackage: package)
            declared.formUnion(urls)
            let unexpected = urls.subtracting(allowedExternalPackages[package] ?? [])
            #expect(
                unexpected.isEmpty,
                "\(package)/Package.swift depends on \(unexpected.sorted().joined(separator: ", "))"
            )
        }

        // The allowlist is a description of the tree, not an aspiration: if
        // `BFMClient` stopped declaring these, every check above would pass on a
        // tree with no generated client in it.
        #expect(declared == allowedExternalPackages.values.reduce(into: Set()) { $0.formUnion($1) })
    }

    /// One URL, one version, wherever it is declared.
    ///
    /// Two packages now pin `swift-openapi-runtime`, and a generated client
    /// linked against one runtime while the middleware wrapping it was compiled
    /// against another is the kind of mismatch that surfaces as a link error at
    /// best. `exact:` on both is what makes SwiftPM refuse to resolve a
    /// disagreement rather than pick a winner — this asserts the `exact:` is
    /// actually there, on every copy, which is the part a reviewer would not
    /// notice missing.
    @Test("every copy of an external pin names the same exact version")
    func externalPinsAgree() throws {
        var declarations: [String: Int] = [:]
        var pinned: [String: Set<String>] = [:]
        var pinCounts: [String: Int] = [:]
        for package in try packageNames() {
            for url in try externalPackageURLs(ofPackage: package) {
                declarations[url, default: 0] += 1
            }
            for (url, version) in try exactPins(ofPackage: package) {
                pinned[url, default: []].insert(version)
                pinCounts[url, default: 0] += 1
            }
        }

        for (url, count) in declarations {
            // A `from:` or a range contributes no pin, so this is what catches
            // the copy that quietly stopped being exact — the case where
            // SwiftPM resolves a disagreement instead of refusing it.
            #expect(
                pinCounts[url] == count,
                "\(url) is declared \(count) time(s) but exactly pinned \(pinCounts[url] ?? 0)"
            )
            #expect(
                pinned[url]?.count == 1,
                "\(url) is pinned to \(pinned[url]?.sorted() ?? [])"
            )
        }
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
    private var packagesDirectory: URL { PackageTree.directory }

    private func packageNames() throws -> Set<String> { try PackageTree.names() }

    private var appDirectory: URL { PackageTree.appDirectory }

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
        try PackageTree.manifestSource(ofPackage: package)
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

    /// Each `url:` paired with the `exact:` that follows it. A declaration
    /// without one contributes nothing, which is what makes the version
    /// agreement check above fail rather than pass vacuously.
    private func exactPins(ofPackage package: String) throws -> [(url: String, version: String)] {
        let source = try manifestSource(ofPackage: package)
        return source.matches(of: #/url:\s*"([^"]+)"\s*,\s*exact:\s*"([^"]+)"/#)
            .map { (String($0.1), String($0.2)) }
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
