import Testing

@testable import DesignPlayground

/// The thresholds, at their edges, and the one escalation that must never
/// happen.
@Suite("Inventory staleness")
internal struct InventoryStalenessTests {
    @Test("a recent copy says nothing at all")
    func freshIsSilent() {
        #expect(InventoryStaleness.disclosure(minutesSinceSync: 0) == .silent)
        #expect(InventoryStaleness.disclosure(minutesSinceSync: 29) == .silent)
    }

    @Test("the dated threshold is crossed at thirty minutes, not after it")
    func datedBoundary() {
        #expect(InventoryStaleness.disclosure(minutesSinceSync: 30) == .dated)
        #expect(InventoryStaleness.disclosure(minutesSinceSync: 23 * 60 + 59) == .dated)
    }

    @Test("the stale threshold is crossed at a day, not after it")
    func staleBoundary() {
        #expect(InventoryStaleness.disclosure(minutesSinceSync: 24 * 60 - 1) == .dated)
        #expect(InventoryStaleness.disclosure(minutesSinceSync: 24 * 60) == .stale)
        #expect(InventoryStaleness.disclosure(minutesSinceSync: 40 * 24 * 60) == .stale)
    }

    @Test("age alone never reaches needs attention, however long the gap")
    func ageNeverEscalatesToUrgent() {
        for minutes in [0, 29, 30, 24 * 60, 365 * 24 * 60] {
            let sync = InventoryStaleness.sync(minutesSinceSync: minutes)

            #expect(sync != .needsAttention)
            #expect(sync.prominence <= .visible)
        }
    }

    @Test("a stale copy reaches the visible tier and a dated one does not")
    func tiersFollowTheThresholds() {
        #expect(InventoryStaleness.sync(minutesSinceSync: 30).prominence == .silent)
        #expect(InventoryStaleness.sync(minutesSinceSync: 24 * 60).prominence == .visible)
    }

    @Test("the age is said in the units a reader would use")
    func agesReadNaturally() {
        #expect(InventoryStaleness.age(minutesSinceSync: 0) == "just now")
        #expect(InventoryStaleness.age(minutesSinceSync: 22) == "22 min ago")
        #expect(InventoryStaleness.age(minutesSinceSync: 60) == "1 hour ago")
        #expect(InventoryStaleness.age(minutesSinceSync: 95) == "1 hour ago")
        #expect(InventoryStaleness.age(minutesSinceSync: 26 * 60) == "26 hours ago")
        #expect(InventoryStaleness.age(minutesSinceSync: 4 * 24 * 60) == "4 days ago")
    }

    @Test("a lookup result is marked behind exactly when its age is disclosable")
    func lookupMarksFollowTheThresholds() {
        let fresh = InventoryLookupResult(
            item: InventoryFoundationFixtures.cable, minutesSinceSync: 29)
        let dated = InventoryLookupResult(
            item: InventoryFoundationFixtures.cable, minutesSinceSync: 30)

        #expect(!fresh.isStale)
        #expect(dated.isStale)
    }
}
