import Testing

@testable import DesignPlayground

/// What pressing Save does to a batch, as values.
///
/// Saving is one write per purchase, so a batch can stop partway. These pin
/// the three things a stopped save must get right: which purchases are still
/// the batch's, which one the refusal is drawn against, and whether Save can
/// be pressed again at all.
@Suite("Review saving")
internal struct ReviewSavingTests {
    private struct Entry: Identifiable {
        let id: String
    }

    private let batch = ["e1", "e2", "e3"].map(Entry.init)

    private func ids(_ entries: [Entry]) -> [String] { entries.map(\.id) }

    @Test("nothing written and nothing discarded is the whole batch")
    func anUntouchedBatchIsWhole() {
        #expect(ids(ReviewBatch.remaining(batch, discarded: [], written: 0)) == ["e1", "e2", "e3"])
    }

    /// Offering to discard a purchase that now exists would be a lie about
    /// what Cancel does, so a written purchase is gone from the batch.
    @Test("what an earlier attempt wrote has left the batch")
    func writtenPurchasesLeave() {
        #expect(ids(ReviewBatch.remaining(batch, discarded: [], written: 2)) == ["e3"])
    }

    /// Saving walked the survivors, so `written` counts survivors. Counting
    /// from the original batch instead would hand back a purchase already
    /// saved and hide one that was not.
    @Test("a purchase discarded before saving is not counted as written")
    func discardsComeOutBeforeWritesAreCounted() {
        #expect(ids(ReviewBatch.remaining(batch, discarded: ["e1"], written: 1)) == ["e3"])
    }

    @Test("only a save in flight holds the controls")
    func onlyAnInFlightSaveHolds() {
        #expect(ReviewSaving.saving(done: 0).isInFlight)
        #expect(!ReviewSaving.idle.isInFlight)
        #expect(!ReviewSaving.failed(id: "e1", reason: "r", retryable: true).isInFlight)
    }

    /// The danger banner belongs to the purchase that was refused. Drawn on
    /// any other it would send the reader to fix something that is fine.
    @Test("a refusal is drawn against the purchase it was about and no other")
    func theRefusalNamesItsPurchase() {
        let refused = ReviewSaving.failed(id: "e2", reason: "r", retryable: true)

        #expect(refused.notice(for: "e2") != nil)
        #expect(refused.notice(for: "e1") == nil)
        #expect(ReviewSaving.idle.notice(for: "e2") == nil)
        #expect(refused.failedID == "e2")
    }

    /// A duplicate cannot be retried past. A Try again that walks into the
    /// same refusal is a button that cannot work, so Save holds instead.
    @Test("only a refusal no retry can pass holds Save")
    func onlyAnUnretryableRefusalHolds() {
        #expect(ReviewSaving.failed(id: "e1", reason: "r", retryable: false).blocksSave)
        #expect(!ReviewSaving.failed(id: "e1", reason: "r", retryable: true).blocksSave)
        #expect(!ReviewSaving.saving(done: 1).blocksSave)
        #expect(!ReviewSaving.idle.blocksSave)
    }
}
