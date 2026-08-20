#if canImport(UIKit)

    import AppCore
    import CoreGraphics
    import Testing
    import UIKit

    @testable import FeatureReceiptCapture

    /// What a photographed page becomes on the wire.
    ///
    /// UIKit-only, and so Simulator-only in this repo's lanes — the same
    /// honesty as the encoder itself. There is nothing to fake here: the
    /// question is whether real `UIImage` bytes come out as a JPEG inside the
    /// budget, which a stub could only answer about itself.
    @Suite("Receipt page encoding")
    internal struct ReceiptPageEncodingTests {
        /// A page with actual content rather than a blank fill: a uniform image
        /// compresses to almost nothing, which would make every size assertion
        /// below meaningless.
        private static func page(_ size: CGSize) -> UIImage {
            let format = UIGraphicsImageRendererFormat.preferred()
            format.scale = 1
            return UIGraphicsImageRenderer(size: size, format: format).image { context in
                UIColor.white.setFill()
                context.fill(CGRect(origin: .zero, size: size))
                UIColor.black.setFill()
                for row in stride(from: 0, to: Int(size.height), by: 8) {
                    context.fill(CGRect(x: 0, y: row, width: Int(size.width), height: 3))
                }
            }
        }

        private static func decoded(_ part: ReceiptPart) -> UIImage? {
            UIImage(data: part.data)
        }

        @Test("a page becomes a JPEG the media type names")
        func aPageBecomesAJPEG() throws {
            let page = Self.page(CGSize(width: 40, height: 60))
            let part = try #require(ReceiptPageEncoder.part(from: page))

            #expect(part.mediaType == .jpeg)
            #expect(!part.data.isEmpty)
            // The bytes are actually a decodable image, not merely non-empty.
            #expect(Self.decoded(part) != nil)
            // JPEG's own magic, so a change of encoder cannot quietly disagree
            // with the media type this claims to be sending.
            #expect(part.data.prefix(2) == Data([0xFF, 0xD8]))
        }

        /// The budget is not advice. A full-resolution page has to come back
        /// smaller, or an eight-part receipt is an upload nobody can send from a
        /// shop.
        @Test("an oversized page is scaled down before it is sent")
        func oversizedPagesShrink() throws {
            let oversized = CGSize(
                width: ReceiptPageBudget.standard.longestEdge + 600,
                height: ReceiptPageBudget.standard.longestEdge + 900
            )
            let part = try #require(ReceiptPageEncoder.part(from: Self.page(oversized)))
            let decoded = try #require(Self.decoded(part))

            let pixels = CGSize(
                width: decoded.size.width * decoded.scale,
                height: decoded.size.height * decoded.scale)
            let longest = max(pixels.width, pixels.height)
            #expect(longest <= ReceiptPageBudget.standard.longestEdge)
            #expect(longest > 0)
        }

        @Test("a page already inside the budget keeps its pixels")
        func smallPagesKeepTheirSize() throws {
            let size = CGSize(width: 300, height: 400)
            let part = try #require(ReceiptPageEncoder.part(from: Self.page(size)))
            let decoded = try #require(Self.decoded(part))

            #expect(decoded.size.width * decoded.scale == size.width)
            #expect(decoded.size.height * decoded.scale == size.height)
        }

        /// Order is the whole of what a multi-page receipt means: the parts are
        /// read top to bottom, and a set that came back shuffled would be read
        /// as a different receipt.
        @Test("pages come back in the order they were given")
        func pageOrderSurvives() {
            let sizes = [
                CGSize(width: 40, height: 60),
                CGSize(width: 80, height: 60),
                CGSize(width: 120, height: 60),
            ]
            let parts = ReceiptPageEncoder.parts(from: sizes.map(Self.page))

            #expect(parts.count == sizes.count)
            let widths = parts.compactMap { Self.decoded($0)?.size.width }
            #expect(widths == sizes.map(\.width))
        }
    }

#endif
