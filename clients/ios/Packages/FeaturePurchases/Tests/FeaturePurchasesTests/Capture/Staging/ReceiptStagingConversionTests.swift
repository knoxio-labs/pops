import AppCore
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Receipt staging conversion")
internal struct ReceiptStagingConversionTests {
    @Test(
        "accepted file extensions map to their upload media",
        arguments: [
            ("jpg", ReceiptMediaType.jpeg),
            ("jpeg", .jpeg),
            (".JPG", .jpeg),
            ("png", .png),
            ("webp", .webp),
            ("gif", .gif),
            ("heic", .jpeg),
            ("HEIF", .jpeg),
            ("pdf", .pdf),
            ("txt", .plainText),
        ])
    func acceptedExtensions(pathExtension: String, expected: ReceiptMediaType) {
        #expect(ReceiptStagingConversion.mediaType(forPathExtension: pathExtension) == expected)
    }

    @Test("unsupported file extensions are refused")
    func unsupportedExtension() {
        #expect(ReceiptStagingConversion.mediaType(forPathExtension: "docx") == nil)
        #expect(ReceiptStagingConversion.mediaType(forPathExtension: "") == nil)
    }

    @Test("a multi-page PDF stays one unmodified staging part")
    func pdfStaysOnePart() {
        let data = Data("%PDF-1.7\n/Page\n/Page\n%%EOF".utf8)

        let page = ReceiptStagingConversion.page(
            id: "document",
            label: "receipt.pdf",
            data: data,
            mediaType: .pdf)

        #expect(page.id == "document")
        #expect(page.label == "receipt.pdf")
        #expect(page.media == .pdf)
        #expect(page.bytes == nil)
        #expect(page.part.data == data)
    }
}
