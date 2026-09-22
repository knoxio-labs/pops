import AppCore
import Foundation

/// One receipt page selected for staging before it has been read.
public struct StagedPage: Identifiable, Hashable, Sendable {
    /// The stable identity used while rearranging the page.
    public let id: String
    /// The source filename or capture label shown beneath the page.
    public let label: String
    /// The receipt payload that reading receives.
    public let part: ReceiptPart

    /// Creates a staged page around a receipt payload.
    public init(id: String, label: String, part: ReceiptPart) {
        self.id = id
        self.label = label
        self.part = part
    }

    /// The page's media type.
    public var media: ReceiptMediaType { part.mediaType }

    /// Renderable image bytes, or `nil` for document and text placeholders.
    public var bytes: Data? {
        switch media {
        case .jpeg, .png, .webp, .gif: part.data
        case .pdf, .plainText: nil
        }
    }

    /// The placeholder symbol used when the page is not a renderable image.
    public var symbolName: String {
        switch media {
        case .jpeg, .png, .webp, .gif: "doc.text.image"
        case .pdf: "doc.richtext"
        case .plainText: "doc.plaintext"
        }
    }
}

/// Pages staged to be read as one receipt and one request.
public struct StagedReceipt: Identifiable, Hashable, Sendable {
    /// The stable receipt identity retained while its pages move.
    public let id: String
    /// The receipt pages in reading order.
    public var pages: [StagedPage]

    /// Creates a staged receipt from its ordered pages.
    public init(id: String, pages: [StagedPage]) {
        self.id = id
        self.pages = pages
    }
}

/// An ordered staged-receipt collection with page rearrangement operations.
///
/// Empty receipts do not survive an operation. Pages selected after staging opens arrive as
/// separate loose receipts until the person groups them.
public struct StagedReceipts: Hashable, Sendable {
    /// The ordered staged receipts.
    public private(set) var receipts: [StagedReceipt]

    /// Creates a collection from ordered staged receipts.
    public init(_ receipts: [StagedReceipt]) {
        self.receipts = receipts
    }

    /// Receipts containing more than one page.
    public var groups: [StagedReceipt] { receipts.filter { $0.pages.count > 1 } }

    /// Pages that are each staged as a one-page receipt.
    public var loose: [StagedPage] {
        receipts.filter { $0.pages.count == 1 }.flatMap(\.pages)
    }

    /// Every page in receipt and page order.
    public var everyPage: [StagedPage] { receipts.flatMap(\.pages) }

    /// The number of staged receipts.
    public var count: Int { receipts.count }

    /// Whether no receipts are staged.
    public var isEmpty: Bool { receipts.isEmpty }

    /// Moves `ids` after the page identified by `targetID`, forming one receipt.
    public mutating func combine(_ ids: [String], with targetID: String) {
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

    /// Moves `ids` to the end of the receipt identified by `receiptID`.
    public mutating func move(_ ids: [String], into receiptID: String) {
        let taken = take(Set(ids))
        guard !taken.isEmpty else { return }
        if let index = receipts.firstIndex(where: { $0.id == receiptID }) {
            receipts[index].pages.append(contentsOf: taken)
        } else {
            receipts.append(StagedReceipt(id: receiptID, pages: taken))
        }
    }

    /// Moves each identified page into a separate loose receipt.
    public mutating func separate(_ ids: [String]) {
        let taken = take(Set(ids))
        receipts.append(contentsOf: taken.map { StagedReceipt(id: "r-\($0.id)", pages: [$0]) })
    }

    /// Adds each previously unstaged page as a separate loose receipt.
    public mutating func add(_ pages: [StagedPage]) {
        var known = Set(everyPage.map(\.id))
        for page in pages where known.insert(page.id).inserted {
            receipts.append(StagedReceipt(id: "r-\(page.id)", pages: [page]))
        }
    }

    /// Deletes the identified page and removes its receipt when it becomes empty.
    public mutating func delete(_ id: String) {
        _ = take([id])
    }

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
