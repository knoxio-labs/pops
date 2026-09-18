import Testing

@testable import DesignPlayground

@Suite("Inventory sync ledger")
internal struct InventorySyncLedgerTests {
    private typealias Fixtures = InventorySyncFixtures

    private var ledger: InventorySyncLedger {
        InventorySyncLedger(repairs: Fixtures.repairs, resolved: Fixtures.resolved)
    }

    @Test("a fix moves the repair to the top of Resolved with its outcome")
    func fixResolves() {
        var ledger = ledger
        let offer = ledger.resolve(Fixtures.code.id)

        #expect(offer?.id == Fixtures.code.id)
        #expect(offer?.message == "Relabelled B413")
        #expect(!ledger.repairs.contains { $0.id == Fixtures.code.id })
        #expect(ledger.resolved.first?.id == Fixtures.code.id)
        #expect(ledger.resolved.first?.outcome == "Relabelled B413")
        #expect(ledger.resolvedToday == Fixtures.resolved.filter(\.isToday).count + 1)
    }

    @Test("Undo puts the repair back where it stood and unlists its resolution")
    func undoRestoresInPlace() throws {
        var ledger = ledger
        let resolved = ledger.resolve(Fixtures.code.id)
        let offer = try #require(resolved)
        ledger.undo(offer)

        #expect(ledger.repairs.map(\.id) == Fixtures.repairs.map(\.id))
        #expect(ledger.resolved.map(\.id) == Fixtures.resolved.map(\.id))
    }

    @Test("Undo only works once")
    func undoIsSpent() throws {
        var ledger = ledger
        let resolved = ledger.resolve(Fixtures.placement.id)
        let offer = try #require(resolved)
        ledger.undo(offer)
        ledger.undo(offer)

        #expect(ledger.repairs.map(\.id) == Fixtures.repairs.map(\.id))
    }

    @Test("resolving what is not listed changes nothing")
    func unknownRepairIsIgnored() {
        var ledger = ledger
        let offer = ledger.resolve("not-a-repair")

        #expect(offer == nil)
        #expect(ledger == self.ledger)
    }

    @Test("a conflict kept either way names the value that stayed")
    func conflictOutcomeNamesTheKeptValue() {
        #expect(Fixtures.placement.outcome(keepingMine: true) == "Kept Office 04")
        #expect(Fixtures.placement.outcome(keepingMine: false) == "Kept Hall cupboard")
    }

    @Test("a typed code wins over the suggested one")
    func typedCodeWins() {
        #expect(Fixtures.code.outcome(keepingMine: true, code: "B500") == "Relabelled B500")
    }

    @Test("the waiting list replays a crate before the move into it")
    func waitingIsInReplayOrder() {
        let ids = InventorySyncLedger(waiting: Fixtures.waiting).waiting.map(\.id)

        #expect(ids.first == Fixtures.crateCreated.id)
        #expect(ids.dropFirst().first == Fixtures.espressoMoved.id)
        #expect(ids.count == Fixtures.waiting.count)
    }

    @Test("sending counts only what has progress")
    func sendingIsWhatHasProgress() {
        #expect(InventorySyncLedger(waiting: Fixtures.waiting).sending.isEmpty)
        #expect(InventorySyncLedger(waiting: Fixtures.sending).sending.count == 2)
    }

    @Test("no repair says it failed; each names what happened and two ways out")
    func vocabularyHasNoDeadEnds() {
        for repair in Fixtures.everyRepair {
            #expect(!repair.problem.localizedCaseInsensitiveContains("fail"), "\(repair.id)")
            #expect(repair.kind.keep != repair.kind.letGo, "\(repair.id)")
            #expect(
                repair.outcome(keepingMine: true) != repair.outcome(keepingMine: false),
                "\(repair.id)")
        }
    }

    @Test("every repair's record exists, so its row has a name and a mark")
    func repairsPointAtRecords() {
        for repair in Fixtures.everyRepair {
            #expect(InventorySearchFixtures.record(id: repair.recordID) != nil, "\(repair.id)")
        }
        for entry in Fixtures.resolved {
            #expect(InventorySearchFixtures.record(id: entry.recordID) != nil, "\(entry.id)")
        }
    }
}
