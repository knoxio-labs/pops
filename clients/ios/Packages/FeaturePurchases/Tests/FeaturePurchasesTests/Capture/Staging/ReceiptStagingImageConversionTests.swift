#if canImport(UIKit)

    import AppCore
    import Testing
    import UIKit

    @testable import FeaturePurchases

    @Suite("Receipt staging image conversion")
    internal struct ReceiptStagingImageConversionTests {
        @Test("an image is encoded as a JPEG inside the supplied pixel budget")
        func imageIsBudgeted() throws {
            let budget = ReceiptPageBudget(longestEdge: 40, compressionQuality: 0.8)
            let renderer = UIGraphicsImageRenderer(size: CGSize(width: 160, height: 80))
            let source = renderer.image { context in
                UIColor.systemBlue.setFill()
                context.fill(CGRect(x: 0, y: 0, width: 160, height: 80))
            }

            let result = ReceiptStagingConversion.page(
                id: "photo", label: "receipt.heic", image: source, budget: budget)
            let page = try result.get()
            let encoded = try #require(UIImage(data: page.part.data))
            let pixels = CGSize(
                width: encoded.size.width * encoded.scale,
                height: encoded.size.height * encoded.scale)

            #expect(page.media == .jpeg)
            #expect(!page.part.data.isEmpty)
            #expect(max(pixels.width, pixels.height) <= budget.longestEdge)
        }

        @Test("an image that cannot be encoded is refused")
        func unreadableImage() {
            let result = ReceiptStagingConversion.page(
                id: "empty", label: "empty.jpg", image: UIImage())

            #expect(result == .failure(.unreadable))
        }
    }

#endif
