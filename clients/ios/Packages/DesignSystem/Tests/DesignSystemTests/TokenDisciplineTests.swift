import Foundation
import Testing

/// The package's own rule, enforced against the package. Its reach stops at
/// this package's `Sources` — nothing here can see a feature module.
@Suite("Token discipline")
struct TokenDisciplineTests {
    private static let packageRoot = URL(filePath: #filePath)
        .deletingLastPathComponent() // DesignSystemTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // package root

    private static var sourcesRoot: URL { packageRoot.appending(path: "Sources/DesignSystem") }

    @Test("no source file names a colour or a metric outside the token layer")
    func sourcesAreClean() throws {
        let files = try TokenDisciplineScanner.swiftFiles(under: Self.sourcesRoot)
        try #require(!files.isEmpty, "found no Swift sources under \(Self.sourcesRoot.path) — the scan would pass vacuously")

        let violations = try files.flatMap { try TokenDisciplineScanner.violations(in: $0, relativeTo: Self.packageRoot) }
        #expect(violations.isEmpty, "\n\(violations.map(\.description).joined(separator: "\n"))")
    }

    @Test("the scanner catches what it exists to catch", arguments: [
        (##"Color(hex: "#FF0000")"##, "hex colour literal"),
        (#"let tint = Color.red"#, "system colour"),
        (#"    .foregroundStyle(.secondary)"#, "system colour"),
        (#"let shade = UIColor.systemBackground"#, "raw colour construction"),
        (#"Color(red: 1, green: 0, blue: 0)"#, "raw colour construction"),
        (#"    .padding(16)"#, "numeric metric literal"),
        (#"    .padding(.horizontal, 8)"#, "numeric metric literal"),
        (#"VStack(spacing: 12) {"#, "numeric metric literal"),
        (#"    .frame(width: 44, height: 44)"#, "numeric metric literal"),
        (#"    .stroke(border, lineWidth: 2)"#, "numeric metric literal"),
        (#"    .font(.system(size: 17))"#, "fixed font size"),
    ])
    func plantedViolationIsCaught(source: String, rule: String) throws {
        let violations = try TokenDisciplineScanner.violations(inSource: source, file: "planted.swift")
        #expect(violations.map(\.rule).contains(rule), "expected \(rule) for: \(source)")
    }

    @Test("token-layer and primitive idioms are not flagged", arguments: [
        #"static let popsAccent = Color(popsToken: "popsAccent")"#,
        #"    .padding(.horizontal, PopsSpacing.lg)"#,
        #"VStack(spacing: PopsSpacing.md) {"#,
        #"    .frame(maxWidth: .infinity, maxHeight: .infinity)"#,
        #"RoundedRectangle(cornerRadius: PopsRadius.card)"#,
        #"    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)"#,
        #"ForEach(ColorScheme.allCases, id: \.self) { scheme in"#,
        #"    .environment(\.colorScheme, scheme)"#,
        #"static let popsTitle = Font.system(.title2, weight: .semibold)"#,
        #"Spacer(minLength: PopsSpacing.sm)"#,
    ])
    func legitimateSourceIsNotFlagged(source: String) throws {
        let violations = try TokenDisciplineScanner.violations(inSource: source, file: "legitimate.swift")
        #expect(violations.isEmpty, "\(violations.map(\.description).joined(separator: "\n"))")
    }

    @Test("comments cannot trip the scan, and cannot hide a violation either")
    func commentsAreStripped() throws {
        let source = """
        // Never write Color.red here.
        /* .padding(16) in a block comment is prose too. */
        let name = "#FF0000" // but a string literal is code
        """

        let violations = try TokenDisciplineScanner.violations(inSource: source, file: "commented.swift")

        #expect(violations.map(\.rule) == ["hex colour literal"])
        #expect(violations.map(\.line) == [3])
    }

    @Test("a block comment spanning lines does not swallow the code after it")
    func multiLineBlockCommentEnds() throws {
        let source = """
        /* opening
           .padding(16)
        */ VStack(spacing: 4) {
        """

        let violations = try TokenDisciplineScanner.violations(inSource: source, file: "block.swift")

        #expect(violations.map(\.line) == [3])
    }
}
