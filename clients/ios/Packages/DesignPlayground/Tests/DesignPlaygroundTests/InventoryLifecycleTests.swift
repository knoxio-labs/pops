import Testing

@testable import DesignPlayground

/// Transition rules for POPS-3989: what a lifecycle action is allowed to do,
/// what restoring returns to, and what a grouped disposition leaves behind.
/// Reuses ``InventoryAction`` rather than re-deriving its rules, because the
/// rule that matters, that only active items offer removal and only
/// restorable ones offer the way back, already lives there and should not
/// be answered twice.
@Suite("Inventory lifecycle transitions")
internal struct InventoryLifecycleTransitionTests {
    private let defaults = InventoryFoundationStyle()

    private func ids(_ item: InventoryFoundationItem) -> [String] {
        InventoryAction.available(for: item, style: defaults).map(\.id)
    }

    @Test("a retired item, like discarded and lost, offers only the way back")
    func retiredOffersRestoreOnly() {
        #expect(ids(InventoryLifecycleFixtures.retiredCamera) == ["restore"])
    }

    @Test(
        "a queued disposition still reads as inactive; sync state does not change what is offered")
    func queuedDispositionOffersRestoreOnly() {
        #expect(ids(InventoryLifecycleFixtures.queuedDiscard) == ["restore"])
    }

    @Test("a conflicting edit is still a discard first; restoring is still the only action")
    func conflictedLifecycleOffersRestoreOnly() {
        #expect(ids(InventoryLifecycleFixtures.conflictedLifecycle) == ["restore"])
    }

    @Test("restoring returns an item to active, which counts toward totals again")
    func restoreReturnsToActive() {
        let restored = InventoryLifecycleFixtures.restoredKettle

        #expect(restored.lifecycle == .active)
        #expect(restored.lifecycle.countsTowardTotals)
    }

    @Test("a container that still holds things is not offered as emptiable by removing it")
    func nonEmptyContainerIsRejected() {
        let rejection = InventoryLifecycleFixtures.rejection

        #expect(rejection.item.isContainer)
        #expect(rejection.item.access == .open)
        #expect(!rejection.reason.isEmpty)
        #expect(!rejection.nextStep.isEmpty)
    }
}

@Suite("Inventory disposition draft")
internal struct InventoryDispositionDraftTests {
    @Test("removing every unit disposes of the whole record")
    func removingAllDisposesOfWholeRecord() {
        var draft = InventoryDispositionDraft(totalCount: 120)
        draft.quantityRemoved = 120

        #expect(draft.disposesOfWholeRecord)
        #expect(draft.remainingAfter == 0)
    }

    @Test("removing part of a group leaves the rest, and does not dispose of the record")
    func removingSomeLeavesTheRest() {
        var draft = InventoryDispositionDraft(totalCount: 120)
        draft.quantityRemoved = 20

        #expect(!draft.disposesOfWholeRecord)
        #expect(draft.remainingAfter == 100)
    }

    @Test("a record of one has nothing to reduce, and defaults to disposing of it entirely")
    func singleRecordHasNoPartialReduction() {
        let draft = InventoryDispositionDraft(totalCount: 1)

        #expect(draft.quantityRemoved == nil)
        #expect(draft.disposesOfWholeRecord)
    }

    @Test("a grouped draft defaults to removing everything until told otherwise")
    func groupedDraftDefaultsToEverything() {
        let draft = InventoryDispositionDraft(totalCount: 4)

        #expect(draft.quantityRemoved == 4)
        #expect(draft.remainingAfter == 0)
    }
}

@Suite("Inventory lifecycle timeline")
internal struct InventoryTimelineEventTests {
    @Test("a restore event in the timeline is flagged as undoing an earlier one")
    func restoreIsFlaggedAsAReversal() {
        let restore = InventoryLifecycleFixtures.timeline.first { $0.verb == "Restored" }

        #expect(restore?.isReversal == true)
    }

    @Test("an ordinary discard is not flagged as a reversal")
    func discardIsNotAReversal() {
        let discards = InventoryLifecycleFixtures.timeline.filter { $0.verb == "Discarded" }

        #expect(discards.allSatisfy { !$0.isReversal })
    }

    @Test("a drill-in's full account is never emptier than the compact detail")
    func fullDetailIsAtLeastAsInformative() {
        for event in InventoryLifecycleFixtures.timeline {
            #expect(event.fullDetail.count >= event.detail.count)
        }
    }
}

@Suite("Inventory discard reasons")
internal struct InventoryDiscardReasonTests {
    @Test("every reason has a label and a registered symbol")
    func everyReasonIsPresentable() {
        for reason in InventoryDiscardReason.allCases {
            #expect(!reason.label.isEmpty)
            #expect(InventorySymbol.all.contains { $0.symbol == reason.symbol })
        }
    }

    @Test("reasons are listed once each")
    func reasonsAreUnique() {
        let ids = InventoryDiscardReason.allCases.map(\.id)

        #expect(Set(ids).count == ids.count)
    }
}
