import AppCore
import Foundation
import Testing

@testable import FeatureInventory

@Suite("Lifecycle menu and history lines")
internal struct InventoryLifecycleMenuTests {
    private typealias Entry = InventoryLifecycleMenuEntry

    @Test("an active single item offers discard, lost, retire and destroy, and no Restore")
    func activeSingle() {
        #expect(
            Entry.entries(lifecycle: .active, quantity: InventoryQuantity(count: 1))
                == [.discard(count: nil), .markLost, .retire, .destroy])
    }

    @Test("a group is discarded whole, and offers split and change quantity")
    func activeGroup() {
        #expect(
            Entry.entries(lifecycle: .active, quantity: InventoryQuantity(count: 10))
                == [.discard(count: 10), .split, .changeQuantity, .markLost, .retire, .destroy])
    }

    @Test(
        "an inactive item offers only Restore and Destroy",
        arguments: [InventoryLifecycle.retired, .discarded, .lost])
    func inactiveRestores(lifecycle: InventoryLifecycle) {
        #expect(
            Entry.entries(lifecycle: lifecycle, quantity: InventoryQuantity(count: 3))
                == [.restore, .destroy])
    }

    @Test(
        "destroyed, and a lifecycle this build does not know, offer nothing",
        arguments: [InventoryLifecycle.destroyed, .unrecognised("archived")])
    func terminalOffersNothing(lifecycle: InventoryLifecycle) {
        #expect(Entry.entries(lifecycle: lifecycle, quantity: InventoryQuantity(count: 1)).isEmpty)
    }

    @Test("an immediate command applies only from the state it starts from")
    func immediateCommandsGuardTheirStart() {
        typealias Model = InventoryItemDetailViewModel
        #expect(Model.change(for: .discard(.sold), from: .lost) == nil)
        #expect(Model.change(for: .restore, from: .active) == nil)
        #expect(Model.change(for: .restore, from: .destroyed) == nil)
        #expect(Model.change(for: .destroy, from: .active) == nil)
        #expect(Model.change(for: .retire, from: .active)?.lifecycle == .retired)
        #expect(Model.change(for: .discard(.sold), from: .active)?.reason == .sold)
    }

    @Test("history dates say Today and Yesterday, then the day")
    func historyDates() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "UTC"))
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 9, day: 18, hour: 12)))
        let yesterday = now.addingTimeInterval(-86_400)
        let future = now.addingTimeInterval(3_600)

        #expect(InventoryHistoryDate.when(now, now: now, calendar: calendar) == "Today")
        #expect(InventoryHistoryDate.when(future, now: now, calendar: calendar) == "Today")
        #expect(InventoryHistoryDate.when(yesterday, now: now, calendar: calendar) == "Yesterday")
    }

    @Test("history groups lines by month, in the order they arrive")
    func historyMonths() {
        let lines = [("September 2026", 3), ("September 2026", 2), ("August 2026", 1)].map {
            InventoryActivityEntry(
                seq: $0.1, verb: "Edited", subject: "", detail: "", when: "", kind: .edit,
                symbol: .edit, month: $0.0, from: nil, to: nil, reason: nil, device: nil,
                isUndoable: false)
        }

        let months = InventoryHistoryMonth.group(lines)

        #expect(months.map(\.title) == ["September 2026", "August 2026"])
        #expect(months.map { $0.entries.map(\.seq) } == [[3, 2], [1]])
    }
}
