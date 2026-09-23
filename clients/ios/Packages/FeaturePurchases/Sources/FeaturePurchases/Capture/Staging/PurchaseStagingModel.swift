import AppCore
import Foundation
import Observation

/// Observable state for arranging pages into receipts before reading begins.
///
/// Receipt groups have no page-count ceiling. The server's request-size limit is the only upload
/// bound, so this model delegates every rearrangement without imposing a second limit.
@MainActor @Observable
public final class PurchaseStagingModel {
    private var staged: StagedReceipts
    private var pendingReplacementID: String?

    internal private(set) var refusal: ReceiptCaptureProblem?

    /// Creates empty staging state.
    public init() {
        staged = StagedReceipts([])
    }

    internal init(receipts: [StagedReceipt]) {
        staged = StagedReceipts(receipts)
    }

    internal var groups: [StagedReceipt] { staged.groups }
    internal var loose: [StagedPage] { staged.loose }
    internal var receipts: [StagedReceipt] { staged.receipts }
    internal var everyPage: [StagedPage] { staged.everyPage }
    internal var count: Int { staged.count }
    internal var isEmpty: Bool { staged.isEmpty }

    internal func combine(_ ids: [String], with targetID: String) {
        staged.combine(ids, with: targetID)
    }

    internal func move(_ ids: [String], into receiptID: String) {
        staged.move(ids, into: receiptID)
    }

    internal func separate(_ ids: [String]) {
        staged.separate(ids)
    }

    internal func delete(_ id: String) {
        staged.delete(id)
    }

    internal func acknowledgeRefusal() {
        refusal = nil
    }

    internal func addScanned(_ parts: [ReceiptPart], pageCount: Int) {
        guard pageCount != 0 else {
            refusal = .noPages
            return
        }
        guard parts.count == pageCount else {
            refusal = .unpreparedPages
            return
        }
        refusal = nil
        let receiptID = UUID().uuidString
        let pages = parts.enumerated().map { index, part in
            StagedPage(
                id: "\(receiptID)-\(index)",
                label: "Scan page \(index + 1)",
                part: part)
        }
        staged = StagedReceipts(
            staged.receipts + [StagedReceipt(id: receiptID, pages: pages)])
    }

    internal var readingInput: [StagedReceiptForReading] {
        staged.receipts.map { receipt in
            StagedReceiptForReading(id: receipt.id, parts: receipt.pages.map(\.part))
        }
    }

    internal func beginReplacing(_ pageID: String) {
        pendingReplacementID = everyPage.contains { $0.id == pageID } ? pageID : nil
    }

    internal func replaceIfPending(with page: StagedPage) -> Bool {
        guard let pendingReplacementID else { return false }
        self.pendingReplacementID = nil
        return staged.replace(pendingReplacementID, with: page)
    }
}
