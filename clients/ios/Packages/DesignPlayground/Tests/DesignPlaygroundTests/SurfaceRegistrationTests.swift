import Foundation
import Testing

@testable import DesignPlayground

/// `Catalog.surfaces` is a hand-written list, because Swift has no runtime
/// globbing. The mistake that list invites is not a typo — it is a surface that
/// was written, reviewed and never added, which looks like nothing at all.
///
/// So this reads the source: every `SurfaceID` literal under `Surfaces/` names
/// a surface somebody built to be looked at, and every one of them has to come
/// back out of the catalogue.
@Suite("Surface registration")
@MainActor
internal struct SurfaceRegistrationTests {
    /// `.../Tests/DesignPlaygroundTests/SurfaceRegistrationTests.swift`
    /// → `.../Sources/DesignPlayground/Surfaces`.
    private var surfacesDirectory: URL {
        URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources")
            .appending(path: "DesignPlayground")
            .appending(path: "Surfaces")
    }

    private func declaredIDs() throws -> Set<String> {
        let pattern = /SurfaceID\(area: "([a-z-]+)", slug: "([a-z-]+)"\)/
        var found: Set<String> = []
        for file in swiftFiles(under: surfacesDirectory) {
            let source = try String(contentsOf: file, encoding: .utf8)
            for match in source.matches(of: pattern) {
                found.insert("\(match.1)/\(match.2)")
            }
        }
        return found
    }

    private func swiftFiles(under directory: URL) -> [URL] {
        guard
            let enumerator = FileManager.default.enumerator(
                at: directory, includingPropertiesForKeys: nil)
        else { return [] }
        return enumerator.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Without this, every assertion below passes on a tree the scan cannot
    /// read — a moved directory, a renamed initialiser — by finding nothing and
    /// reporting that nothing is missing.
    @Test("the scan finds the surfaces it is asserting about")
    func scanIsWiredUp() throws {
        let declared = try declaredIDs()

        #expect(declared.count >= 8, "the scan found \(declared.count) surface ids, not a tree")
        #expect(declared.contains("transactions/list"))
        #expect(declared.contains("shell/root"))
    }

    @Test("every surface written under Surfaces is in the catalogue")
    func everyDeclaredSurfaceIsRegistered() throws {
        let registered = Set(Catalog.surfaces.map(\.id.description))
        let unregistered = try declaredIDs().subtracting(registered)

        #expect(
            unregistered.isEmpty,
            "built but unreachable: \(unregistered.sorted().joined(separator: ", "))"
        )
    }
}
