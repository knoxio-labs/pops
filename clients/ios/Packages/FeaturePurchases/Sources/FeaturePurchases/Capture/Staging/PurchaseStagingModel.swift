import Observation

/// Observable state for arranging pages into receipts before reading begins.
///
/// Receipt groups have no page-count ceiling. The server's request-size limit is the only upload
/// bound, so this model delegates every rearrangement without imposing a second limit.
@MainActor @Observable
public final class PurchaseStagingModel {
    private var staged: StagedReceipts

    /// Creates empty staging state.
    public init() {
        staged = StagedReceipts([])
    }

    internal init(receipts: [StagedReceipt]) {
        staged = StagedReceipts(receipts)
    }

    internal var groups: [StagedReceipt] { staged.groups }
    internal var loose: [StagedPage] { staged.loose }
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
}
