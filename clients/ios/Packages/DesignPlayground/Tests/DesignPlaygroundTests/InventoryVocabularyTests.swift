import Testing

@testable import DesignPlayground

/// ADR-001's vocabulary as behaviour. Each suite here is a rule the ADR states
/// in prose, checked where a component would otherwise be free to break it.
@Suite("Inventory placement")
internal struct InventoryPlacementTests {
    private typealias Fixtures = InventoryFoundationFixtures

    @Test("the effective location is found by following containers outward")
    func effectiveLocationFollowsContainers() {
        #expect(Fixtures.television.placement.effectiveLocation == "Living room")
        #expect(Fixtures.screws.placement.effectiveLocation == "Garage")
    }

    @Test("a chain ending in someone's hand has no effective location")
    func carriedAndInHandHaveNoLocation() {
        #expect(Fixtures.espresso.placement.effectiveLocation == nil)
        #expect(Fixtures.passport.placement.effectiveLocation == nil)
    }

    @Test("the containing item is the innermost container, and only a contained item has one")
    func containingItemIsInnermost() {
        #expect(Fixtures.screws.placement.containingItem == "Small parts tray")
        #expect(Fixtures.television.placement.containingItem == nil)
        #expect(Fixtures.passport.placement.containingItem == nil)
    }

    @Test("crumbs run room first, then containers inward, and a carried chain has no room")
    func crumbsAreOrdered() {
        #expect(Fixtures.screws.placement.crumbs == ["Garage", "Garage tools", "Small parts tray"])
        #expect(Fixtures.espresso.placement.crumbs == ["Moving crate 3"])
        #expect(Fixtures.passport.placement.crumbs.isEmpty)
    }

    @Test("a long path collapses to its two ends, and a short one is left alone")
    func collapsingKeepsBothEnds() {
        #expect(Fixtures.screws.placement.collapsedCrumbs == ["Garage", "…", "Small parts tray"])
        #expect(Fixtures.cable.placement.collapsedCrumbs == ["Study", "Office 04"])
        #expect(Fixtures.television.placement.collapsedCrumbs == ["Living room"])
    }

    @Test("the summary names the container first and the room second")
    func summaryOrder() {
        #expect(
            Fixtures.screws.placement.summary(inHandTerm: "In hand")
                == "In Small parts tray · Garage")
        #expect(Fixtures.television.placement.summary(inHandTerm: "In hand") == "Living room")
    }

    @Test("a carried container is said to be carried rather than given an invented room")
    func carriedSummary() {
        #expect(
            Fixtures.espresso.placement.summary(inHandTerm: "In hand")
                == "In Moving crate 3 · being carried")
    }

    @Test(
        "the in-hand wording uses whichever term the style chose, with the way back when there is one"
    )
    func inHandSummaryUsesTheTerm() {
        #expect(
            Fixtures.passport.placement.summary(inHandTerm: "Unplaced")
                == "Unplaced · was in Documents drawer")
        #expect(
            InventoryPlacement.inHand(previous: nil).summary(inHandTerm: "Picked up") == "Picked up"
        )
    }

    @Test("a contained placement with no containers degrades to its room rather than crashing")
    func emptyContainerChain() {
        let placement = InventoryPlacement.contained(location: "Garage", containers: [])

        #expect(placement.summary(inHandTerm: "In hand") == "Garage")
        #expect(placement.containingItem == nil)
    }
}

@Suite("Inventory state axes")
internal struct InventoryStateAxisTests {
    @Test("only an active item counts toward totals")
    func onlyActiveCounts() {
        let counting = InventoryLifecycle.allCases.filter(\.countsTowardTotals)

        #expect(counting == [.active])
    }

    @Test("everything but active and destroyed can be restored")
    func restorability() {
        let restorable = InventoryLifecycle.allCases.filter(\.isRestorable)

        #expect(restorable == [.retired, .discarded, .lost])
    }

    @Test("a container's access and its lifecycle are separate marks, never one")
    func axesStaySeparate() {
        let discardedBox = InventoryFoundationItem(
            id: "box", name: "Box", typeName: "Storage box",
            placement: .direct(location: "Garage"), access: .closed, lifecycle: .discarded)

        let marks = InventoryStateMark.marks(for: discardedBox)

        #expect(marks.map(\.id) == ["access", "lifecycle"])
        #expect(marks.map(\.label) == ["Closed", "Discarded"])
    }

    @Test("an active item that is not a container has nothing to say")
    func ordinaryItemHasNoMarks() {
        #expect(InventoryStateMark.marks(for: InventoryFoundationFixtures.television).isEmpty)
    }

    @Test("an open container is the one state drawn as a warning")
    func openIsTheWarning() {
        #expect(
            InventoryStateMark.marks(for: InventoryFoundationFixtures.kitchenBox).first?.isWarning
                == true)
        #expect(
            InventoryStateMark.marks(for: InventoryFoundationFixtures.linenBox).first?.isWarning
                == false)
    }
}

@Suite("Inventory sync prominence")
internal struct InventorySyncProminenceTests {
    @Test("saved and synchronized are both silent — the phone's usual state is not a problem")
    func usualStatesAreSilent() {
        #expect(InventorySync.saved.prominence == .silent)
        #expect(InventorySync.synchronized.prominence == .silent)
    }

    @Test("prominence escalates from work in flight to staleness to failure")
    func escalation() {
        #expect(InventorySync.queued.prominence < InventorySync.stale.prominence)
        #expect(InventorySync.stale.prominence < InventorySync.needsAttention.prominence)
        #expect(InventorySync.synchronizing.prominence == InventorySync.queued.prominence)
    }

    @Test("each visibility setting lets through exactly its tiers")
    func visibilityFilters() {
        let problemsOnly = InventorySync.allCases.filter(
            InventoryFoundationStyle.SyncVisibility.fromVisible.shows)
        let inFlight = InventorySync.allCases.filter(
            InventoryFoundationStyle.SyncVisibility.fromQuiet.shows)
        let all = InventorySync.allCases.filter(
            InventoryFoundationStyle.SyncVisibility.everything.shows)

        #expect(problemsOnly == [.stale, .needsAttention])
        #expect(inFlight == [.queued, .synchronizing, .stale, .needsAttention])
        #expect(all == InventorySync.allCases)
    }
}

@Suite("Inventory quantity")
internal struct InventoryQuantityTests {
    @Test("one shows nothing, several show a count, and none left says so")
    func badges() {
        #expect(InventoryQuantity(count: 1).badge == nil)
        #expect(InventoryQuantity(count: 12).badge == "×12")
        #expect(InventoryQuantity(count: 0).badge == "None left")
    }

    @Test("a negative count reads as exhausted rather than as a number")
    func negativeIsExhausted() {
        #expect(InventoryQuantity(count: -3).badge == "None left")
    }
}
