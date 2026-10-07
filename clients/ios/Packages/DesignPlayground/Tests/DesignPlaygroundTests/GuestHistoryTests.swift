import Foundation
import Testing

@testable import DesignPlayground

@Suite("Guest history")
internal struct GuestHistoryTests {
    private func event(
        _ id: String, entry: String = "txn", _ action: GuestHistoryEvent.Action,
        actor: GuestHistoryEvent.Actor = .you, at seconds: TimeInterval = 0,
        changes: [GuestFieldChange] = []
    ) -> GuestHistoryEvent {
        GuestHistoryEvent(
            id: id, entryID: entry, subject: "Lunch", action: action, actor: actor,
            at: Date(timeIntervalSince1970: seconds), changes: changes)
    }

    private func change(_ field: String) -> GuestFieldChange {
        GuestFieldChange(field: field, before: "a", after: "b")
    }

    @Test("a deletion nothing has undone is awaiting restore")
    func standingDeletionAwaitsRestore() {
        let events = [event("created", .created, at: 1), event("deleted", .deleted, at: 2)]

        #expect(GuestHistoryEvent.awaitingRestore(in: events) == ["deleted"])
    }

    @Test("a later restore clears it, in whichever order the log arrives")
    func restoredDeletionDoesNot() {
        let deleted = event("deleted", .deleted, at: 2)
        let restored = event("restored", .restored, at: 3)

        #expect(GuestHistoryEvent.awaitingRestore(in: [restored, deleted]).isEmpty)
        #expect(GuestHistoryEvent.awaitingRestore(in: [deleted, restored]).isEmpty)
    }

    @Test("deleted again after a restore, it awaits restore again")
    func deletedAgain() {
        let events = [
            event("d1", .deleted, at: 1), event("r1", .restored, at: 2),
            event("d2", .deleted, at: 3),
        ]

        #expect(GuestHistoryEvent.awaitingRestore(in: events) == ["d2"])
    }

    @Test("one entry's restore does not clear another's deletion")
    func entriesAreIndependent() {
        let events = [
            event("d-a", entry: "a", .deleted, at: 1), event("r-b", entry: "b", .restored, at: 2),
        ]

        #expect(GuestHistoryEvent.awaitingRestore(in: events) == ["d-a"])
    }

    @Test("the activity fixture leaves exactly one deletion standing")
    func fixtureHasOneStandingDeletion() {
        #expect(
            GuestHistoryEvent.awaitingRestore(in: GuestFixtures.ledgerActivity) == ["evt-parking-2"]
        )
        #expect(GuestHistoryEvent.awaitingRestore(in: GuestFixtures.ticketsHistory).isEmpty)
    }

    @Test("on one entry a line never repeats the entry's name")
    func entryScopeSaysThis() {
        #expect(GuestHistoryCopy.headline(event("e", .created), scope: .entry) == "You added this")
        #expect(
            GuestHistoryCopy.headline(event("e", .deleted, actor: .other("Tomas")), scope: .entry)
                == "Tomas deleted this")
    }

    @Test("across an account every line names its entry")
    func accountScopeNamesTheEntry() {
        #expect(
            GuestHistoryCopy.headline(
                event("e", .restored, actor: .other("Tomas")), scope: .account)
                == "Tomas restored Lunch")
        #expect(
            GuestHistoryCopy.headline(
                event("e", .updated, changes: [change("Amount")]), scope: .account)
                == "You changed Lunch")
    }

    @Test("an edit names up to two fields and counts the rest")
    func editsNameWhatMoved() {
        let headline = { (fields: [String]) in
            GuestHistoryCopy.headline(
                event("e", .updated, changes: fields.map(change)), scope: .entry)
        }

        #expect(headline([]) == "You changed this")
        #expect(headline(["Amount"]) == "You changed the amount")
        #expect(headline(["Amount", "Date"]) == "You changed the amount and date")
        #expect(headline(["Amount", "Date", "Description"]) == "You changed 3 details")
    }
}
