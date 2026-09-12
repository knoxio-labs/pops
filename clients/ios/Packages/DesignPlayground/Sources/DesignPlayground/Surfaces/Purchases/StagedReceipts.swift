import AppCore
import Foundation

/// One file a person picked, before anything has read it.
internal struct StagedPage: Identifiable, Hashable {
    internal let id: String
    /// What the file is called where it came from. Shown small and below the
    /// picture, because at this point it is the least useful fact about the
    /// file — but it is the only one that tells two photographs of two till
    /// receipts apart when both look like paper.
    internal let label: String
    internal let media: ReceiptMediaType
    internal let bytes: Data?

    /// The plate's glyph when there is no picture to draw — a page that is not
    /// an image still has to occupy the plate and say which kind it is, the
    /// rule `ReceiptPageMedia` already follows on the result screen. Here
    /// rather than in each view that draws a page, because three copies of one
    /// switch is three chances for a new media type to be handled twice and
    /// forgotten once.
    internal var symbolName: String {
        switch media {
        case .jpeg, .png, .webp, .gif: "doc.text.image"
        case .pdf: "doc.richtext"
        case .plainText: "doc.plaintext"
        }
    }
}

/// Pages that will be sent as one receipt and one call.
internal struct StagedReceipt: Identifiable, Hashable {
    internal let id: String
    internal var pages: [StagedPage]
}

/// What is staged, and every way a drag can rearrange it.
///
/// Separate from the view because this is where the rearrangement is decided
/// and none of it is about drawing. A drop lands on one of three things — a
/// page, a receipt, or the loose area — and each is one of the operations
/// below; the view's only job is to say which was hit.
///
/// Empty receipts never survive an operation. A receipt is its pages, so one
/// with none is not an empty receipt, it is nothing.
internal struct StagedReceipts: Hashable {
    internal private(set) var receipts: [StagedReceipt]

    internal init(_ receipts: [StagedReceipt]) {
        self.receipts = receipts
    }

    internal var groups: [StagedReceipt] { receipts.filter { $0.pages.count > 1 } }

    internal var loose: [StagedPage] {
        receipts.filter { $0.pages.count == 1 }.flatMap(\.pages)
    }

    internal var everyPage: [StagedPage] { receipts.flatMap(\.pages) }

    internal var count: Int { receipts.count }

    internal var isEmpty: Bool { receipts.isEmpty }

    /// Dropped onto another page: the two become one receipt, the target's
    /// pages first. Dropping a page onto itself is not a rearrangement and is
    /// ignored rather than producing a receipt of one.
    internal mutating func combine(_ ids: [String], with targetID: String) {
        let moving = Set(ids).subtracting([targetID])
        guard !moving.isEmpty,
            let target = receipts.first(where: { $0.pages.contains { $0.id == targetID } })
        else { return }
        let taken = take(moving)
        guard !taken.isEmpty else { return }
        if let index = receipts.firstIndex(where: { $0.id == target.id }) {
            receipts[index].pages.append(contentsOf: taken)
        }
    }

    /// Dropped onto a receipt: the pages join it. The receipt can have been
    /// emptied by the take — every one of its own pages dragged onto it — so
    /// it is rebuilt rather than assumed to still be there.
    internal mutating func move(_ ids: [String], into receiptID: String) {
        let taken = take(Set(ids))
        guard !taken.isEmpty else { return }
        if let index = receipts.firstIndex(where: { $0.id == receiptID }) {
            receipts[index].pages.append(contentsOf: taken)
        } else {
            receipts.append(StagedReceipt(id: receiptID, pages: taken))
        }
    }

    /// Dropped on the loose area: each page becomes a receipt of its own. A
    /// page that was already loose lands where it started, which is what
    /// dropping it back should do.
    internal mutating func separate(_ ids: [String]) {
        let taken = take(Set(ids))
        receipts.append(contentsOf: taken.map { StagedReceipt(id: "r-\($0.id)", pages: [$0]) })
    }

    internal mutating func delete(_ id: String) {
        _ = take([id])
    }

    /// Pulls `ids` out of whatever receipts hold them, dropping any receipt
    /// left with nothing. Every operation above is this plus a decision about
    /// where the pages land.
    private mutating func take(_ ids: Set<String>) -> [StagedPage] {
        var taken: [StagedPage] = []
        var remaining: [StagedReceipt] = []
        for receipt in receipts {
            let moving = receipt.pages.filter { ids.contains($0.id) }
            let staying = receipt.pages.filter { !ids.contains($0.id) }
            taken.append(contentsOf: moving)
            if !staying.isEmpty {
                remaining.append(StagedReceipt(id: receipt.id, pages: staying))
            }
        }
        receipts = remaining
        return taken
    }
}
