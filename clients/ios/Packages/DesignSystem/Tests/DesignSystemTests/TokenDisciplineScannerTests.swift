import Foundation
import Testing

/// The rules themselves, against source held in a string. What the scanner
/// reads, and from where, is `TokenDisciplineTests`.
///
/// Every rule is exercised against a violation it must catch and against the
/// token-layer idiom nearest to it, because a scan that flags the correct
/// spelling gets turned off rather than obeyed.
@Suite("Token discipline rules")
internal struct TokenDisciplineScannerTests {
    @Test(
        "the scanner catches what it exists to catch",
        arguments: [
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
        let violations = try TokenDisciplineScanner.violations(
            inSource: source, file: "planted.swift")
        #expect(violations.map(\.rule).contains(rule), "expected \(rule) for: \(source)")
    }

    @Test(
        "token-layer and primitive idioms are not flagged",
        arguments: [
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
        let violations = try TokenDisciplineScanner.violations(
            inSource: source, file: "legitimate.swift")
        #expect(violations.isEmpty, "\(violations.map(\.description).joined(separator: "\n"))")
    }

    @Test("comments cannot trip the scan, and cannot hide a violation either")
    func commentsAreStripped() throws {
        let source = """
            // Never write Color.red here.
            /* .padding(16) in a block comment is prose too. */
            let name = "#FF0000" // but a string literal is code
            """

        let violations = try TokenDisciplineScanner.violations(
            inSource: source, file: "commented.swift")

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

        let violations = try TokenDisciplineScanner.violations(
            inSource: source, file: "block.swift")

        #expect(violations.map(\.line) == [3])
    }

    @Test("a nested block comment closes where Swift closes it, not at the first */")
    func nestedBlockCommentClosesOnce() throws {
        let source = """
            /* outer /* inner */ .padding(16)
            */
            """

        let violations = try TokenDisciplineScanner.violations(
            inSource: source, file: "nested.swift")

        #expect(violations.isEmpty, "\(violations.map(\.description).joined(separator: "\n"))")
    }

    @Test("a comment opener inside a multi-line string cannot swallow the code after it")
    func multiLineStringIsNotAComment() throws {
        let source = #"""
            let copy = """
            /* this is prose, not a comment
            """
            VStack(spacing: 4) {
            """#

        let violations = try TokenDisciplineScanner.violations(
            inSource: source, file: "multiline.swift")

        #expect(violations.map(\.line) == [4])
    }

    @Test("the same holds for a raw multi-line string, whose delimiter carries a pound count")
    func rawMultiLineStringIsNotAComment() throws {
        let source = ##"""
            let copy = #"""
            /* this is prose, not a comment
            """#
            VStack(spacing: 4) {
            """##

        let violations = try TokenDisciplineScanner.violations(
            inSource: source, file: "rawmultiline.swift")

        #expect(violations.map(\.line) == [4])
    }

    @Test("a backslash in a raw string is content, so it cannot eat the closing quote")
    func rawStringBackslashIsNotAnEscape() throws {
        let source = ##"""
            let path = #"a\"#
            VStack(spacing: 4) {
            """##

        let violations = try TokenDisciplineScanner.violations(inSource: source, file: "raw.swift")

        #expect(violations.map(\.line) == [2])
    }

    @Test("a hex literal inside a raw string is still a hex literal")
    func rawStringHexIsCaught() throws {
        let source = ##"let brand = #"#FF0000"#"##

        let violations = try TokenDisciplineScanner.violations(
            inSource: source, file: "rawhex.swift")

        #expect(violations.map(\.rule) == ["hex colour literal"])
    }
}
