import Foundation
import Testing

/// The dependency direction, asserted by reading the tree rather than by the
/// compiler. SwiftLint cannot express "this module may not name that one"
/// (POPS-1371 configures it; no rule there covers this), and the compiler only
/// refuses an import a manifest never declared — it has nothing to say about a
/// wrong edge being added to the manifest in the first place. So this reads the
/// sources.
@Suite("Module boundaries")
struct ModuleBoundaryTests {
    /// Packages allowed to name a concrete implementation of an `AppCore` seam,
    /// because they are the mechanism: `Auth` owns pairing, key material and the
    /// authenticating transport; `BFMClient` owns the generated types and the
    /// calls that carry them.
    private let implementationPackages: Set<String> = ["Auth", "BFMClient"]

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

    @Test("fakes stay out of shipping code")
    func fakesAreTestOnly() throws {
        for package in try packageNames() {
            for file in try sourceFiles(inPackage: package)
            where !file.path.contains("/Sources/AppCoreFakes/") {
                #expect(
                    !(try importedModules(in: file).contains("AppCoreFakes")),
                    "\(package)/\(file.lastPathComponent) imports AppCoreFakes outside a test target"
                )
            }
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

    private func sourceFiles(inPackage package: String) throws -> [URL] {
        let sources = packagesDirectory.appending(path: package).appending(path: "Sources")
        guard let enumerator = FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil)
        else { return [] }
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func declaredDependencies(ofPackage package: String) throws -> Set<String> {
        let manifest = packagesDirectory.appending(path: package).appending(path: "Package.swift")
        let source = try String(contentsOf: manifest, encoding: .utf8)
        let pattern = #/\.package\(path:\s*"\.\./([A-Za-z_][A-Za-z0-9_]*)"\)/#
        return Set(source.matches(of: pattern).map { String($0.1) })
    }

    /// A line scan rather than a parse: an `import` inside a block comment or a
    /// string literal would be a false positive, and neither has ever appeared
    /// in a Swift file worth writing.
    private func importedModules(in file: URL) throws -> Set<String> {
        let source = try String(contentsOf: file, encoding: .utf8)
        let pattern =
            #/^\s*(?:@[A-Za-z_]+\s+)?import\s+(?:struct|class|enum|protocol|func|var|let|typealias)?\s*([A-Za-z_][A-Za-z0-9_]*)/#
        return Set(
            source
                .split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .compactMap { try? pattern.firstMatch(in: String($0)) }
                .map { String($0.1) }
        )
    }
}
