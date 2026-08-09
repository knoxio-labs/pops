import Foundation
import Testing

/// The property that makes "no generated type escapes this module" a compiler
/// error everywhere else, asserted against the files themselves.
///
/// `openapi-generator-config.yaml` sets `accessModifier: internal`, and that one
/// line is the whole boundary: flip it to `public` and every generated type
/// becomes part of the app's module graph, at which point regenerating the
/// client is a cross-module refactor rather than a diff in one directory. That
/// change would produce a clean build, a clean lint and a green CI run — the
/// generated code is excluded from both linters by design — so nothing but this
/// would notice.
@Suite("Generated sources")
internal struct GeneratedSourcesTests {
    /// `.../Packages/BFMClient/Tests/BFMClientTests/GeneratedSourcesTests.swift`
    private var generatedDirectory: URL {
        URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/BFMClient/Generated")
    }

    private func generatedFiles() throws -> [URL] {
        try FileManager.default
            .contentsOfDirectory(at: generatedDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    /// Without this every assertion below passes on an empty directory, which is
    /// exactly the state a failed or half-committed regeneration leaves behind.
    @Test("the generator's output is committed")
    func outputIsCommitted() throws {
        let names = try generatedFiles().map(\.lastPathComponent)
        #expect(names == ["Client.swift", "Types.swift"])
    }

    @Test("no generated declaration is visible outside this module")
    func everyDeclarationIsInternal() throws {
        // Matched at the start of a line so a `public` inside a doc comment or a
        // string literal is not a false positive; generated Swift puts every
        // declaration's access level first on its own line.
        let escaping = /^\s*(?:public|package|open)\s/
        for file in try generatedFiles() {
            let offenders = try String(contentsOf: file, encoding: .utf8)
                .split(separator: "\n", omittingEmptySubsequences: false)
                .filter { try escaping.firstMatch(in: String($0)) != nil }
            #expect(
                offenders.isEmpty,
                """
                \(file.lastPathComponent) declares \(offenders.count) non-internal \
                declaration(s) — `accessModifier` in openapi-generator-config.yaml \
                is no longer `internal`. First: \(offenders.first ?? "")
                """
            )
        }
    }

    /// The premise ``BFMClientError``'s guarantee rests on, checked rather than
    /// assumed.
    ///
    /// Each operation reads its payload with `try …body.json` *outside* the
    /// `do`/`catch` that converts `ClientError`, and that is safe only because
    /// every generated body accessor has exactly one case: its `get throws` is
    /// vestigial and cannot fail. A malformed body never reaches it — the
    /// deserializer runs inside `UniversalClient`, which wraps the decoding
    /// error as a `ClientError` before the operation returns.
    ///
    /// That stops being true the moment a response declares a **second content
    /// type**. The generator then emits an accessor that throws
    /// `RuntimeError.unexpectedResponseBody` for the non-matching case, and it
    /// would escape uncaught — silently making "no `ClientError` leaves this
    /// module" false, on a build that compiles, lints and tests clean.
    ///
    /// Asserted here rather than written in a comment, because the change that
    /// breaks it happens in the BFM's contract rather than in any Swift anyone
    /// reads. It fails the moment a regeneration introduces one, which is the
    /// point at which someone can still choose what to do about it.
    @Test("no generated response body can throw on access")
    func responseBodyAccessorsCannotThrow() throws {
        for file in try generatedFiles() {
            let source = try String(contentsOf: file, encoding: .utf8)
            #expect(
                !source.contains("unexpectedResponseBody"),
                """
                \(file.lastPathComponent) has a response with more than one content \
                type, so `try …body.json` can now throw outside the ClientError \
                conversion in BFMHTTPClient. Wrap those body reads before landing \
                the contract change.
                """
            )
        }
    }

    /// The other half of the deal `.swiftlint.yml` and `scripts/swift-sources.sh`
    /// strike: those two exclude this directory from both linters on the grounds
    /// that a generator wrote it. `swift-sources.sh check` proves nothing
    /// unmarked hides in here; this proves the files a regeneration actually
    /// produced still announce themselves, so the marker its check keys on has
    /// not moved.
    @Test("every generated file announces its generator")
    func everyFileCarriesTheGeneratorMarker() throws {
        for file in try generatedFiles() {
            let firstLine = try String(contentsOf: file, encoding: .utf8)
                .split(separator: "\n", omittingEmptySubsequences: false)
                .first
            #expect(
                firstLine == "// Generated by swift-openapi-generator, do not modify.",
                "\(file.lastPathComponent) does not open with the generator's marker"
            )
        }
    }
}
