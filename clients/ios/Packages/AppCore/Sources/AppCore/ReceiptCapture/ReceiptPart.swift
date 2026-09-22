import Foundation

/// What the purchases pillar's drop-zone will read, mirroring its own closed
/// list (`MEDIA_TYPES` in `ingest/receipt/vision.ts`) — a phone photo, a PDF
/// invoice, or a pasted body.
public enum ReceiptMediaType: String, Hashable, Sendable, CaseIterable {
    case jpeg = "image/jpeg"
    case png = "image/png"
    case webp = "image/webp"
    case gif = "image/gif"
    case pdf = "application/pdf"
    case plainText = "text/plain"
}

/// One frame of a receipt, as captured on the phone.
///
/// A full supermarket shop does not fit in one frame, so several photographs
/// of one piece of paper are one receipt and one call to
/// ``ReceiptCaptureRepository/capture(_:)`` — never several. Order matters:
/// top to bottom, the order the paper is read in.
///
/// No ceiling on how many parts one receipt may carry: the server's own
/// body-size limit is the only real bound, per ADR-052
/// (`docs/architecture/adr-052-receipt-part-count-ceiling.md`).
public struct ReceiptPart: Hashable, Sendable {
    public let mediaType: ReceiptMediaType
    public let data: Data

    public init(mediaType: ReceiptMediaType, data: Data) {
        self.mediaType = mediaType
        self.data = data
    }
}
