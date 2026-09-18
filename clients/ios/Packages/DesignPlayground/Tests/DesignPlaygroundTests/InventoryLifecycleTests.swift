import Testing

@testable import DesignPlayground

/// POPS-3989's lifecycle rules as Item detail applies them: removal acts at
/// once and undoes exactly, a group goes whole, Destroy is final, and a
/// reason lives on the event rather than the badge.
@Suite("Inventory lifecycle record")
internal struct InventoryLifecycleRecordTests {
    private let active = InventoryFoundationFixtures.television
    private let forks = InventoryLifecycleFixtures.forks.item

    @Test("discarding acts at once, keeps the reason on the change, and Undo returns exactly")
    func discardAndUndo() throws {
        var record = InventoryLifecycleRecord(item: active)
        let performed = record.discard(.donated, when: "3 Sep")
        let offer = try #require(performed)

        #expect(record.item.lifecycle == .discarded)
        #expect(record.change?.notice == "Discarded 3 Sep · Donated")
        #expect(offer.message == "Discarded")

        record.undo(offer)

        #expect(record.item == active)
        #expect(record.change == nil)
    }

    @Test("the badge stays the lifecycle word whatever the reason")
    func badgeIgnoresReason() throws {
        var record = InventoryLifecycleRecord(item: active)
        let result1 = record.discard(.sold)
        #expect(result1 != nil)

        let marks = InventoryStateMark.marks(for: record.item).map(\.label)
        #expect(marks == ["Discarded"])
    }

    @Test("a group is discarded whole, its quantity untouched")
    func groupDiscardedWhole() throws {
        var record = InventoryLifecycleRecord(item: forks)
        let result2 = record.discard(nil)
        #expect(result2 != nil)

        #expect(record.item.lifecycle == .discarded)
        #expect(record.item.quantity.count == 10)
        #expect(record.change?.notice == "Discarded Today")
    }

    @Test("an inactive item cannot be removed a second time")
    func inactiveCannotBeRemovedAgain() {
        var record = InventoryLifecycleRecord(item: InventoryFoundationFixtures.kettle)

        let result3 = record.discard(.broken)

        #expect(result3 == nil)
        let result4 = record.markLost()
        #expect(result4 == nil)
        let result5 = record.retire()
        #expect(result5 == nil)
    }

    @Test("Restore returns an inactive item to active, and its Undo puts it back")
    func restoreAndUndo() throws {
        let change = InventoryLifecycleChange(lifecycle: .lost, when: "28 Aug")
        var record = InventoryLifecycleRecord(
            item: InventoryFoundationFixtures.drill, change: change)
        let performed = record.restore()
        let offer = try #require(performed)

        #expect(record.item.lifecycle == .active)
        #expect(record.change == nil)

        record.undo(offer)

        #expect(record.item.lifecycle == .lost)
        #expect(record.change == change)
    }

    @Test("nothing restores a destroyed item")
    func destroyedIsFinal() {
        var record = InventoryLifecycleRecord(item: InventoryFoundationFixtures.lamp)

        let result6 = record.restore()

        #expect(result6 == nil)
        let result7 = record.perform(.restore)
        #expect(result7 == nil)
        #expect(record.item.lifecycle == .destroyed)
    }

    @Test("Destroy drops every pending Undo, so an old capsule cannot bring the item back")
    func destroyClearsUndo() throws {
        var record = InventoryLifecycleRecord(item: active)
        let performed = record.markLost()
        let offer = try #require(performed)

        record.destroy(when: "Today")
        record.undo(offer)

        #expect(record.item.lifecycle == .destroyed)
        #expect(record.change?.notice == "Destroyed Today")
    }

    @Test("commands that ask first change nothing when performed directly")
    func askingCommandsDoNothing() {
        var record = InventoryLifecycleRecord(item: forks)

        for command in [InventoryLifecycleCommand.destroy, .split, .changeQuantity] {
            let result8 = record.perform(command)
            #expect(result8 == nil)
        }
        #expect(record.item == forks)
    }

    @Test("a split leaves at least one on each side")
    func splitBounds() throws {
        var record = InventoryLifecycleRecord(item: forks)

        let result9 = record.split(off: 0)

        #expect(result9 == nil)
        let result10 = record.split(off: 10)
        #expect(result10 == nil)

        let performed = record.split(off: 4)

        let offer = try #require(performed)
        #expect(record.item.quantity.count == 6)

        record.undo(offer)
        #expect(record.item.quantity.count == 10)
    }

    @Test("renumbering refuses zero and the count it already has")
    func renumberBounds() throws {
        var record = InventoryLifecycleRecord(item: forks)

        let result11 = record.renumber(to: 0)

        #expect(result11 == nil)
        let result12 = record.renumber(to: 10)
        #expect(result12 == nil)

        let result13 = record.renumber(to: 8)

        #expect(result13 != nil)
        #expect(record.item.quantity.count == 8)
        #expect(record.item.lifecycle == .active)
    }

    @Test("an active record carries no lifecycle change, whatever it was given")
    func activeHasNoChange() {
        let record = InventoryLifecycleRecord(
            item: active, change: InventoryLifecycleChange(lifecycle: .discarded, when: "1 Sep"))

        #expect(record.change == nil)
    }
}

@Suite("Inventory history")
internal struct InventoryHistoryTests {
    @Test("months keep the order events arrive in, and every event lands in one")
    func monthsInOrder() {
        let months = InventoryHistoryMonth.group(InventoryLifecycleFixtures.longHistory)

        #expect(
            months.map(\.title) == [
                "September 2026", "August 2026", "July 2026", "February 2025",
            ])
        #expect(
            months.flatMap(\.entries).map(\.id)
                == InventoryLifecycleFixtures.longHistory.map(\.id))
    }

    @Test("an empty history has no months")
    func emptyHistory() {
        #expect(InventoryHistoryMonth.group([]).isEmpty)
    }

    @Test("a discard's line carries its reason; a move's does not invent one")
    func lineTitles() {
        let discard = InventoryLifecycleFixtures.lifecycle(
            "d", "Discarded", .discard, when: "3 Sep", month: "September 2026", reason: .donated)
        let move = InventoryActivityEntry(
            id: "m", verb: "Moved to", subject: "Garage", detail: "", when: "1 Sep", kind: .move)

        #expect(discard.title == "Discarded · Donated")
        #expect(move.title == "Moved to Garage")
        #expect(move.symbol == InventorySymbol.move)
    }

    @Test("every kind the filter offers is present in the long history")
    func filterKindsAreStaged() {
        let kinds = Set(InventoryLifecycleFixtures.longHistory.map(\.kind))

        #expect(kinds == Set(InventoryHistoryKind.allCases))
    }
}

@Suite("Inventory list discard")
internal struct InventoryListDiscardTests {
    private let records = InventorySearchFixtures.records.filter { $0.kind == .item }

    @Test(
        "discarding from a selection hides the records from a default list, and Undo returns them")
    func discardHidesThenUndo() throws {
        var edits = InventoryRecordEdits(records)
        let ids: Set<String> = ["television", "hdmi"]
        let performed = edits.discard(ids)
        let offer = try #require(performed)
        let filter = InventorySearchFilter()

        #expect(offer.message == "Discarded 2")
        #expect(!edits.records.filter(filter.matches).contains { ids.contains($0.id) })

        var inactive = filter
        inactive.includesInactive = true
        #expect(edits.records.filter(inactive.matches).filter { ids.contains($0.id) }.count == 2)

        edits.undo(offer)
        #expect(edits.records == records)
    }

    @Test("a record already inactive keeps its own lifecycle when discarded with others")
    func alreadyInactiveKeepsLifecycle() throws {
        var edits = InventoryRecordEdits(records)
        let result14 = edits.discard(["lamp", "television"])
        #expect(result14 != nil)

        #expect(edits.records.first { $0.id == "lamp" }?.item.lifecycle == .destroyed)
        #expect(edits.records.first { $0.id == "television" }?.item.lifecycle == .discarded)
    }
}

@Suite("Inventory discard reasons")
internal struct InventoryDiscardReasonTests {
    @Test("the menu's reasons, in its order, each with a registered symbol")
    func reasonsMatchTheMenu() {
        #expect(
            InventoryDiscardReason.allCases.map(\.label) == [
                "Donated", "Sold", "Used up", "Broken", "Gave away",
            ])
        for reason in InventoryDiscardReason.allCases {
            #expect(InventorySymbol.all.contains { $0.symbol == reason.symbol })
        }
    }
}
