import Foundation
import Testing

/// Proof that every identifier `ReceiptResultAccessibility` declares is
/// attached to the view that draws that state, and to no other.
///
/// A declared-but-unattached identifier is worse than no identifier at all —
/// it reads as coverage a Maestro flow could lean on, and fails silently the
/// first time it does. An identifier attached to the *wrong* state is worse
/// again: it is green here and green in a flow that then asserts the wrong
/// screen. So this reads the two files' source and slices it, rather than
/// searching the whole file for a string.
///
/// ## Why source and not a mounted view
///
/// The assertion a reader would rather have is a `UIHostingController` in a
/// real window with its live UIKit accessibility tree walked, the way
/// `ContentViewTabSwitcherTests` mounts a `UITabBarController`. That is not
/// available, and the difference is not the host target, the window frame or
/// the run loop — all three were tried, in the app's own hosted test bundle,
/// on a booted simulator:
///
/// - a `UIWindow(windowScene:)` given a real frame, made key and visible and
///   laid out, holds a `_UIHostingView` of the right type at the right size
///   whose `subviews` and `accessibilityElements` are both **empty**, and
///   stay empty after `drawHierarchy(in:afterScreenUpdates:)` and after six
///   tenths of a second of run loop;
/// - the same walk over a `UIViewController` holding a plain `UILabel` and
///   `UIButton` finds both, by identifier, immediately — so the walk works
///   and the emptiness is SwiftUI's, not the probe's.
///
/// SwiftUI draws its content into a display list rather than into subviews,
/// and builds accessibility elements on demand for an attached accessibility
/// client. A unit-test process has none — `UIAccessibility.isVoiceOverRunning`
/// is false — so there is nothing to walk. `ContentViewTabSwitcherTests`
/// succeeds because it asserts on something else entirely: `TabView` is
/// bridged to a real `UITabBarController` **child view controller**, which
/// mounting does build, and that suite reads `rootViewController.children`
/// rather than any accessibility tree. There is no equivalent UIKit object
/// behind `.accessibilityIdentifier` on a SwiftUI leaf.
///
/// The live tree is therefore reachable only from a process that does attach
/// an accessibility client — which is what the Maestro flows in
/// `clients/ios/.maestro` are, and where these identifiers are ultimately
/// answered for.
@Suite("Receipt result accessibility wiring")
internal struct ReceiptResultAccessibilityWiringTests {
    /// `.../Tests/FeatureReceiptCaptureTests/ReceiptResultAccessibilityWiringTests.swift`
    private static let sourcesDirectory =
        URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "Sources/FeatureReceiptCapture")

    private static func source(_ filename: String) -> [String] {
        let text =
            (try? String(
                contentsOf: sourcesDirectory.appending(path: filename), encoding: .utf8)) ?? ""
        return text.components(separatedBy: "\n")
    }

    private static let cardSource = source("ReceiptResultCard.swift")
    private static let viewSource = source("ReceiptResultView.swift")

    private static let identifiers = [
        "submitting", "retryButton", "created", "needsReview", "unreadable",
    ]

    /// The scan finds real files with real content, and slices them into
    /// regions that are actually smaller than the file. Every assertion below
    /// would hold just as well against a deleted file, or against a slicer
    /// that quietly returned everything.
    @Test("the scan is reading the real source, and slicing it")
    func scanIsWiredUp() throws {
        #expect(Self.cardSource.count > 1, "ReceiptResultCard.swift is empty or missing")
        #expect(Self.viewSource.count > 1, "ReceiptResultView.swift is empty or missing")

        let card = try #require(
            SwiftSource.body(ofFunctionNamed: "createdCard", in: Self.cardSource))
        #expect(!card.isEmpty)
        #expect(
            card.count < Self.cardSource.count,
            "the slicer returned the whole file, so every region assertion below is file-scoped")
    }

    /// The switch that turns an outcome into a card still sends each outcome
    /// to its own builder. Without this, the per-builder assertions below
    /// would prove three functions are correctly labelled while `created`
    /// quietly drew the unreadable card.
    @Test(
        "each outcome still routes to its own card builder",
        arguments: [
            ("created", "createdCard"), ("needsReview", "needsReviewCard"),
            ("unreadable", "unreadableCard"),
        ])
    func eachOutcomeRoutesToItsOwnBuilder(caseName: String, builder: String) throws {
        let branch = try #require(
            SwiftSource.branch(ofCaseNamed: caseName, in: Self.cardSource),
            "ReceiptResultCard's body no longer switches on a `case .\(caseName)`")

        #expect(
            branch.contains { $0.contains("\(builder)(") },
            Comment(rawValue: "`case .\(caseName)` no longer draws \(builder)"))
    }

    /// Every outcome the card draws applies its own identifier — attached to
    /// the card the builder returns, not to something nested inside it, and
    /// not shared with a neighbour. `created` / `needsReview` / `unreadable`
    /// differ from each other only by copy, so a mix-up here is exactly the
    /// failure keying on label text would also make.
    @Test(
        "every result-card outcome applies its own identifier, and only its own",
        arguments: [
            ("created", "createdCard"), ("needsReview", "needsReviewCard"),
            ("unreadable", "unreadableCard"),
        ])
    func everyOutcomeAppliesItsIdentifier(caseName: String, builder: String) throws {
        let body = try #require(
            SwiftSource.body(ofFunctionNamed: builder, in: Self.cardSource),
            "ReceiptResultCard no longer declares \(builder)")

        #expect(
            SwiftSource.appliesIdentifier(caseName, atTopLevelOf: body),
            Comment(
                rawValue: "ReceiptResultAccessibility.\(caseName) is not applied to the view "
                    + "\(builder) returns — a modifier on something nested inside the card "
                    + "identifies that instead of the card"))
        #expect(
            Self.otherIdentifiers(than: caseName, mentionedIn: body).isEmpty,
            Comment(
                rawValue: "\(builder) also reaches for "
                    + "\(Self.otherIdentifiers(than: caseName, mentionedIn: body).joined(separator: ", "))"
                    + " — two states sharing an identifier is the mix-up this suite exists to catch"
            ))
    }

    /// The two states the screen draws itself, rather than delegating to the
    /// card: each identifier is applied inside the `switch` branch for that
    /// state, so an identifier that migrated to a neighbouring branch fails
    /// here rather than in a flow.
    @Test(
        "each screen-level state applies its identifier inside its own branch",
        arguments: [
            (
                "submitting", "submitting",
                ".accessibilityIdentifier(ReceiptResultAccessibility.submitting)"
            ),
            (
                "failed", "retryButton",
                "retryAccessibilityIdentifier: ReceiptResultAccessibility.retryButton"
            ),
        ])
    func eachStateAppliesItsIdentifierInItsBranch(
        caseName: String, identifier: String, application: String
    ) throws {
        let branch = try #require(
            SwiftSource.branch(ofCaseNamed: caseName, in: Self.viewSource),
            "ReceiptResultView's content no longer switches on a `case .\(caseName)`")

        #expect(
            branch.contains { $0.contains(application) },
            Comment(
                rawValue: "ReceiptResultAccessibility.\(identifier) is declared but "
                    + "ReceiptResultView's `case .\(caseName)` branch never applies it"))
        #expect(
            Self.otherIdentifiers(than: identifier, mentionedIn: branch).isEmpty,
            Comment(
                rawValue: "`case .\(caseName)` also reaches for "
                    + "\(Self.otherIdentifiers(than: identifier, mentionedIn: branch).joined(separator: ", "))"
            ))
    }

    private static func otherIdentifiers(than kept: String, mentionedIn region: [String])
        -> [String]
    {
        let text = region.joined(separator: "\n")
        return identifiers.filter { $0 != kept }
            .filter { text.contains("ReceiptResultAccessibility.\($0)") }
    }
}

/// The little bit of Swift-shaped reading the assertions above need: a named
/// function's body, and one `switch` branch.
///
/// By indentation rather than by matching braces. swift-format owns this tree
/// — `mise -C clients/ios run format` is a required check — so a region ends
/// at the first line back at its opener's own indentation, and that is both
/// simpler than brace matching and immune to a brace inside a string literal.
internal enum SwiftSource {
    static func body(ofFunctionNamed name: String, in lines: [String]) -> [String]? {
        guard let start = lines.firstIndex(where: { $0.contains("func \(name)(") }) else {
            return nil
        }
        return region(from: start, in: lines) { $0 == indentation(of: lines[start]) + "}" }
    }

    /// The lines under `case .<name>`, up to the next `case` at the same
    /// indentation or the end of the `switch`.
    static func branch(ofCaseNamed name: String, in lines: [String]) -> [String]? {
        guard
            let start = lines.firstIndex(where: {
                $0.trimmingCharacters(in: .whitespaces).hasPrefix("case .\(name)")
            })
        else { return nil }
        let indent = indentation(of: lines[start])
        return region(from: start, in: lines) {
            $0.hasPrefix(indent + "case ") || $0 == indent + "}"
        }
    }

    private static func region(
        from start: Int, in lines: [String], until isEnd: (String) -> Bool
    ) -> [String] {
        var collected: [String] = []
        var cursor = start
        while cursor < lines.count {
            if cursor > start, isEnd(lines[cursor]) { break }
            collected.append(lines[cursor])
            cursor += 1
        }
        return collected
    }

    /// Whether the identifier is applied to the outermost view of `body`,
    /// rather than to something nested in it. A modifier on the returned view
    /// sits one level in from the function's own indentation; a modifier on a
    /// subview sits further in than that.
    static func appliesIdentifier(_ name: String, atTopLevelOf body: [String]) -> Bool {
        guard let signature = body.first else { return false }
        let outermost = indentation(of: signature) + "    "
        return body.dropFirst().contains {
            $0 == outermost + ".accessibilityIdentifier(ReceiptResultAccessibility.\(name))"
        }
    }

    private static func indentation(of line: String) -> String {
        String(line.prefix { $0 == " " })
    }
}
