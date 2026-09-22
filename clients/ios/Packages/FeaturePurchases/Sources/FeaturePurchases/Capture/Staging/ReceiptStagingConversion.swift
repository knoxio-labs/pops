import AppCore
import Foundation

#if canImport(UIKit)
    import UIKit
#endif

internal enum ReceiptStagingConversion {
    internal enum Failure: Hashable, Sendable {
        case unreadable
        case unsupportedType
    }

    internal static func mediaType(forPathExtension pathExtension: String) -> ReceiptMediaType? {
        let normalized =
            pathExtension
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .drop(while: { $0 == "." })

        switch normalized {
        case "jpg", "jpeg":
            return .jpeg
        case "png":
            return .png
        case "webp":
            return .webp
        case "gif":
            return .gif
        // HEIC and HEIF enter through the image path and are re-encoded as JPEG bytes.
        case "heic", "heif":
            return .jpeg
        case "pdf":
            return .pdf
        case "txt":
            return .plainText
        default:
            return nil
        }
    }

    #if canImport(UIKit)
        internal static func page(
            id: String,
            label: String,
            image: UIImage,
            budget: ReceiptPageBudget = .standard
        ) -> Result<StagedPage, Failure> {
            guard let part = ReceiptPageEncoder.part(from: image, budget: budget) else {
                return .failure(.unreadable)
            }
            return .success(StagedPage(id: id, label: label, part: part))
        }
    #endif

    /// Keeps a PDF or plain-text file as one part and one staging tile.
    ///
    /// The purchases ingest sends a PDF as one model `document` block rather than rasterising its
    /// pages (`pillars/purchases/src/ingest/receipt/anthropic-vision.ts`), matching the web intake.
    internal static func page(
        id: String,
        label: String,
        data: Data,
        mediaType: ReceiptMediaType
    ) -> StagedPage {
        StagedPage(
            id: id,
            label: label,
            part: ReceiptPart(mediaType: mediaType, data: data))
    }
}
