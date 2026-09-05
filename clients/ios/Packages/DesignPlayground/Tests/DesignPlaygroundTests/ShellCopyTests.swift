import Foundation
import Testing

@testable import DesignPlayground

/// `ShellCopy` is a hand-made copy of `RootCopy`, which lives in the app target
/// and so cannot be imported by a package. A duplicate with nothing checking it
/// drifts, and a playground that shows wording the app stopped using is worse
/// than one that shows nothing — it is wrong in a way a reviewer cannot see.
///
/// So this reads the app's source. That is this codebase's established shape
/// for a rule the compiler has nothing to say about — the same one
/// `ModuleBoundaryTests` uses, and for the same reason.
@Suite("Shell copy mirrors the app")
internal struct ShellCopyTests {
    /// `.../Packages/DesignPlayground/Tests/DesignPlaygroundTests/ShellCopyTests.swift`
    /// → `.../App/RootCopy.swift`. Located from this file rather than from a
    /// working directory, because these tests also run inside a simulator whose
    /// cwd is its own and not the repository's.
    private var rootCopySource: URL {
        URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "App")
            .appending(path: "RootCopy.swift")
    }

    private func source() throws -> String {
        try String(contentsOf: rootCopySource, encoding: .utf8)
    }

    /// Without this, every assertion below passes on a tree where `RootCopy`
    /// was renamed, moved, or emptied — the reading would find nothing and
    /// nothing is what it would compare.
    @Test("the app's copy is where this test thinks it is")
    func theSourceIsReadable() throws {
        let source = try source()
        #expect(source.contains("internal enum RootCopy"))
        #expect(source.count > 500, "RootCopy.swift is \(source.count) bytes, which is not a file")
    }

    @Test("retry and degraded are word for word what the app draws")
    func namedLiteralsMatch() throws {
        let source = try source()

        for (name, mirrored) in [("retry", ShellCopy.retry), ("degraded", ShellCopy.degraded)] {
            let pattern = try Regex("static let \(name)\\s*=\\s*\"([^\"]*)\"")
            guard let match = try pattern.firstMatch(in: source), let literal = match[1].substring
            else {
                Issue.record("RootCopy has no string literal named \(name)")
                continue
            }
            #expect(
                String(literal) == mirrored,
                "ShellCopy.\(name) says \"\(mirrored)\" and RootCopy says \"\(literal)\""
            )
        }
    }

    /// Not matched by name: in `RootCopy` this sentence is the guard clause
    /// inside `nothingAvailable(_:)` rather than a property, so what can be
    /// asserted is that the app still contains it.
    @Test("the nothing-offered sentence is still the app's")
    func nothingOfferedIsStillInTheApp() throws {
        #expect(try source().contains(ShellCopy.nothingOffered))
    }

    /// `ShellCopy.nothingUsable` is deliberately absent from this suite. The app
    /// composes it per withheld feature at runtime, so no literal in `RootCopy`
    /// equals it and a scan asserting otherwise would have to encode the
    /// composition — which is the drift it is meant to catch, restated.
    @Test("the sentence fragments that compose the nothing-usable copy are the app's")
    func composedSentenceUsesTheAppsFragments() throws {
        let source = try source()
        #expect(source.contains("needs a newer version of this app."))
        #expect(source.contains("is not available right now."))
        #expect(ShellCopy.nothingUsable.contains("needs a newer version of this app."))
        #expect(ShellCopy.nothingUsable.contains("is not available right now."))
    }
}
