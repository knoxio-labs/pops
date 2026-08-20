import AppCore
import DesignSystem
import Foundation
import SwiftUI
import Testing

@testable import FeatureReceiptCapture

/// What the design pass added, asserted as values rather than as pixels.
///
/// Every claim here is one a render comparison could only make where the
/// colour catalogue compiled, and several are ones it could not make at all —
/// two screens that differ by a glyph and a colour rasterise identically on a
/// lane where no token resolves, which is exactly how "the three outcomes look
/// different" can be green while all three are the same grey card.
@Suite("Receipt surface")
internal struct ReceiptSurfaceTests {
    private static let presentation = ReceiptResultPresentation()

    private static func content(_ outcome: ReceiptOutcome) -> ReceiptResultContent {
        presentation.content(outcome)
    }

    /// The distinction the tri-state rests on, carried by something other
    /// than prose. A reader who has just pressed a button is scanning.
    @Test("the three outcomes open in three different tones")
    func outcomesCarryDistinctTones() {
        let tones = [
            Self.content(.created(purchase: .fake(), alreadyStored: false)).tone,
            Self.content(.needsReview(receiptCount: 1, failures: [.fake()], extracted: .fake()))
                .tone,
            Self.content(.unreadable(receiptCount: 1, reason: "blank")).tone,
        ]

        #expect(Set(tones).count == tones.count)
    }

    /// `needsReview` is a purchase waiting for a person, not a failure.
    /// Drawing it in the same tone as `unreadable` would tell a reader their
    /// money is gone when it is sitting there needing a decision.
    @Test("needs-review is not toned as a failure")
    func needsReviewIsNotAFailure() {
        let needsReview = Self.content(
            .needsReview(receiptCount: 1, failures: [.fake()], extracted: .fake())
        ).tone
        let unreadable = Self.content(.unreadable(receiptCount: 1, reason: "blank")).tone

        #expect(needsReview == .warning)
        #expect(unreadable == .danger)
    }

    @Test("a written purchase is toned as one")
    func createdIsToneSuccess() {
        #expect(Self.content(.created(purchase: .fake(), alreadyStored: false)).tone == .success)
    }
}

/// The refusals, as the redesigned screen draws them.
///
/// `CameraRefusalTests` next door holds the rule about which of them earns a
/// trip to Settings. This holds what the design pass added: each refusal now
/// opens with a heading and a tone rather than one grey paragraph, and none
/// of that is visible to a render comparison on a lane with no palette.
@Suite("Camera refusal presentation")
internal struct CameraRefusalPresentationTests {
    private static let refusing: [CameraAccess] = [.denied, .restricted, .unavailable]

    @Test("every refusal has a heading of its own", arguments: refusing)
    func everyRefusalHasATitle(access: CameraAccess) throws {
        let refusal = try #require(CameraRefusal.refusing(access))

        #expect(!refusal.title.trimmingCharacters(in: .whitespaces).isEmpty)
        #expect(refusal.title != refusal.message, "the heading is the message repeated")
    }

    @Test("no two refusals share a heading")
    func headingsAreDistinct() throws {
        let titles = try Self.refusing.map { try #require(CameraRefusal.refusing($0)).title }

        #expect(Set(titles).count == titles.count)
    }

    /// A phone with no camera has had nothing go wrong with it, and nobody
    /// refused anything. Painting that in a warning tone tells a reader to go
    /// and fix something that is not broken.
    @Test("a device with no camera is information, not a warning")
    func noCameraIsInformational() throws {
        let unavailable = try #require(CameraRefusal.refusing(.unavailable))
        let denied = try #require(CameraRefusal.refusing(.denied))
        let restricted = try #require(CameraRefusal.refusing(.restricted))

        #expect(unavailable.tone == .information)
        #expect(denied.tone == .warning)
        #expect(restricted.tone == .warning)
    }

    /// None of them is a failure. `popsDestructive` means "this failed" or
    /// "this cannot be undone" everywhere else in the app, and nothing has
    /// failed at the point somebody has not yet photographed anything.
    @Test("no refusal draws in the failure tone", arguments: refusing)
    func noRefusalIsDestructive(access: CameraAccess) throws {
        let refusal = try #require(CameraRefusal.refusing(access))

        #expect(refusal.tone != .danger)
    }
}

/// Which captured parts can be shown as a picture, and what stands in for the
/// ones that cannot.
@Suite("Captured pages")
internal struct ReceiptPagesTests {
    private static let drawable: [ReceiptMediaType] = [.jpeg, .png, .webp, .gif]

    @Test("a photographed page is drawn from its own bytes", arguments: drawable)
    func imageTypesCarryTheirBytes(mediaType: ReceiptMediaType) {
        let part = ReceiptPart(mediaType: mediaType, data: Data("bytes".utf8))

        #expect(ReceiptPageMedia.imageData(of: part) == part.data)
    }

    /// A PDF invoice and a pasted body are receipts this contract accepts and
    /// neither is something an image decoder draws. Handing their bytes to
    /// the plate would produce a broken-image glyph, which reads as a
    /// failure — so they take a placeholder that says what they are instead.
    @Test(
        "a page that is not an image is not handed to an image decoder",
        arguments: [ReceiptMediaType.pdf, .plainText])
    func documentTypesDrawAPlaceholder(mediaType: ReceiptMediaType) {
        let part = ReceiptPart(mediaType: mediaType, data: Data("bytes".utf8))

        #expect(ReceiptPageMedia.imageData(of: part) == nil)
    }

    /// Every media type the contract admits has a glyph, and a document is
    /// not drawn as a photograph. One generic icon for all of them tells the
    /// reader nothing about what they sent.
    @Test("every media type says what it is")
    func everyMediaTypeHasASymbol() {
        for mediaType in ReceiptMediaType.allCases {
            let part = ReceiptPart(mediaType: mediaType, data: Data())
            #expect(!ReceiptPageMedia.placeholderSymbol(for: part).isEmpty)
        }

        let pdf = ReceiptPart(mediaType: .pdf, data: Data())
        let text = ReceiptPart(mediaType: .plainText, data: Data())
        let photo = ReceiptPart(mediaType: .jpeg, data: Data())
        #expect(
            ReceiptPageMedia.placeholderSymbol(for: pdf)
                != ReceiptPageMedia.placeholderSymbol(for: text))
        #expect(
            ReceiptPageMedia.placeholderSymbol(for: pdf)
                != ReceiptPageMedia.placeholderSymbol(for: photo))
    }

    /// The pages the result screen draws are the ones that were submitted —
    /// the model keeps them after the call, which is the whole reason the
    /// photograph can sit above the reading.
    @MainActor
    @Test("the result screen's model keeps the pages it sent")
    func theModelKeepsItsPages() {
        let parts = [
            ReceiptPart(mediaType: .jpeg, data: Data("one".utf8)),
            ReceiptPart(mediaType: .jpeg, data: Data("two".utf8)),
        ]
        let model = ReceiptResultViewModel(parts: parts, dependencies: .unbound)

        #expect(model.parts == parts)
    }

    /// One page or five, the pages read as pages rather than as "photo 1 of
    /// 1", which is a count nobody needs.
    @Test("a single page is not announced as one of one")
    func singlePageIsNotCounted() {
        #expect(!ReceiptResultCopy.page(1, of: 1).contains("1"))
        #expect(ReceiptResultCopy.page(2, of: 3).contains("2"))
        #expect(ReceiptResultCopy.page(2, of: 3).contains("3"))
    }
}

/// The words the capture screen shows when a scan produced no receipt.
///
/// `ReceiptCaptureRenderingTests.problemsAreDistinct` makes the same claim by
/// rasterising, and disables itself where the colour catalogue did not
/// compile. Four sentences are four sentences on every lane.
@Suite("Capture problem copy")
internal struct ReceiptCaptureProblemCopyTests {
    private static let everyProblem: [ReceiptCaptureProblem] = [
        .cameraFailed, .noPages, .unpreparedPages, .tooManyPages(9),
    ]

    @Test("every problem says something", arguments: everyProblem)
    func everyProblemHasCopy(problem: ReceiptCaptureProblem) {
        #expect(
            !ReceiptCaptureCopy.message(for: problem)
                .trimmingCharacters(in: .whitespaces).isEmpty)
    }

    /// One sentence covering all four would leave somebody whose scan came
    /// back empty reading that they took too many photographs.
    @Test("no two problems say the same thing")
    func problemsReadDifferently() {
        let messages = Self.everyProblem.map(ReceiptCaptureCopy.message(for:))

        #expect(Set(messages).count == messages.count)
    }

    /// "you took eleven" is what makes the limit actionable, and the limit
    /// itself is what makes the next attempt likely to work.
    @Test("too many pages says how many, and how many are allowed")
    func tooManyPagesCarriesBothNumbers() {
        let message = ReceiptCaptureCopy.message(for: .tooManyPages(11))

        #expect(message.contains("11"))
        #expect(message.contains("\(ReceiptPart.maxPerReceipt)"))
    }
}

/// The one layout decision on these screens that is not the framework's.
@Suite("Line item layout")
internal struct ReceiptLineLayoutTests {
    /// Two columns are two columns until they are not. At the accessibility
    /// sizes a description beside an amount leaves the description a column
    /// two words wide, so the row stacks.
    @Test(
        "a line item stacks at the accessibility text sizes and only there",
        arguments: [
            DynamicTypeSize.xSmall, .small, .medium, .large, .xLarge, .xxLarge, .xxxLarge,
            .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5,
        ])
    func stacksExactlyWhereTheSizeIsAnAccessibilityOne(size: DynamicTypeSize) {
        #expect(ReceiptLineLayout.stacks(at: size) == size.isAccessibilitySize)
    }

    /// The claim above is vacuous if every size answers the same way — the
    /// shape of a test that keys on the same property it asserts. Both
    /// answers have to be reachable.
    @Test("both layouts are reachable")
    func bothLayoutsHappen() {
        #expect(!ReceiptLineLayout.stacks(at: .large))
        #expect(ReceiptLineLayout.stacks(at: .accessibility5))
    }
}
