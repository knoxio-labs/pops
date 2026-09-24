import Testing

@testable import DesignPlayground

@Suite("Inventory catalogue repair")
internal struct InventoryCatalogueRepairTests {
    private typealias Fixtures = InventoryCatalogueFixtures

    @Test("every catalogue repair carries its change, a record and two ways out")
    func everyRepairIsComplete() throws {
        for repair in Fixtures.everyRepair {
            let change = try #require(repair.catalogue, "\(repair.id)")
            #expect(repair.kind == .catalogueChanged, "\(repair.id)")
            #expect(!change.values.isEmpty, "\(repair.id)")
            #expect(InventorySearchFixtures.record(id: repair.recordID) != nil, "\(repair.id)")
            #expect(!repair.problem.localizedCaseInsensitiveContains("fail"), "\(repair.id)")
            #expect(repair.kind.keep != repair.kind.letGo, "\(repair.id)")
            #expect(
                repair.outcome(keepingMine: true) != repair.outcome(keepingMine: false),
                "\(repair.id)")
        }
    }

    @Test("the rows never contradict what Retry does")
    func rowsAgreeWithRetry() throws {
        for repair in Fixtures.everyRepair {
            let change = try #require(repair.catalogue)
            let blocking = change.values.filter(\.fit.blocks)
            switch change.retry {
            case .sends:
                #expect(blocking.isEmpty, "\(repair.id) sends past a blocking row")
            case .refused, .waitsForFields:
                #expect(!blocking.isEmpty, "\(repair.id) is refused with every row fitting")
            }
        }
    }

    @Test("a refusal names the field or value that stops it")
    func refusalNamesTheCause() throws {
        for repair in Fixtures.everyRepair {
            let change = try #require(repair.catalogue)
            guard case .refused(let reason) = change.retry else { continue }
            let named = change.values.filter(\.fit.blocks).contains {
                reason.contains($0.field) || reason.contains($0.value)
            }
            #expect(named, "\(repair.id): \(reason)")
        }
    }

    @Test("Edit item leads while anything blocks; Retry shows only once the fields changed")
    func leadingActionFollowsTheOwnersRule() throws {
        for repair in Fixtures.everyRepair {
            let change = try #require(repair.catalogue)
            #expect(change.offersRetry == change.definitionsChanged, "\(repair.id)")
            if change.isBlocked || !change.definitionsChanged {
                #expect(change.leadingAction == .editItem, "\(repair.id)")
            } else {
                #expect(change.leadingAction == .retry, "\(repair.id)")
            }
        }
        #expect(Fixtures.shieldingArchived.catalogue?.offersRetry == false)
        #expect(Fixtures.shieldingAfterChange.catalogue?.leadingAction == .editItem)
        #expect(Fixtures.shieldingAfterChange.catalogue?.offersRetry == true)
        #expect(Fixtures.fieldsArrived.catalogue?.leadingAction == .retry)
    }

    @Test("a catalogue repair's one-tap entry points open it rather than retrying")
    func oneTapOpensTheRepair() {
        #expect(InventoryRepairKind.catalogueChanged.opensRepair)
        #expect(InventoryRepairKind.catalogueChanged.fix.title == "Review")
        for kind in [InventoryRepairKind.conflict, .codeCollision, .deletedElsewhere, .photoFailed]
        {
            #expect(!kind.opensRepair, "\(kind)")
        }
    }

    @Test("Edit item opens a form, and only a blocked value is left out of it")
    func editItemHasAForm() throws {
        let change = try #require(Fixtures.shieldingArchived.catalogue)
        #expect(Fixtures.editDraft(for: Fixtures.shieldingArchived) != nil)
        #expect(change.values.filter(\.fit.blocks).map(\.field) == ["Shielding"])
    }

    @Test("a stale reference leads with Edit item and names its field in the problem")
    func staleReferenceLeadsWithEditItem() throws {
        for repair in [Fixtures.recordGone, Fixtures.recordNotAllowed] {
            let change = try #require(repair.catalogue)
            #expect(change.leadingAction == .editItem, "\(repair.id)")
            #expect(!change.offersRetry, "\(repair.id)")
            let blocking = change.values.filter(\.fit.blocks)
            #expect(blocking.count == 1, "\(repair.id)")
            #expect(repair.problem.hasPrefix(blocking.first?.field ?? "-"), "\(repair.id)")
        }
        #expect(InventoryFieldFit.recordGone.caption == "Gone")
        #expect(InventoryFieldFit.recordNotAllowed.caption == "Not allowed")
    }

    @Test("an unreadable change is stalled, and says so")
    func unreadableIsStalled() {
        #expect(Fixtures.unreadable.hold == .stalled)
        #expect(Fixtures.unreadable.caption == "Can't be read · Can't be sent")
    }

    @Test("only a Retry that sends has no alert")
    func refusalIsNilOnlyWhenSending() {
        #expect(InventoryCatalogueRetry.sends.refusal == nil)
        #expect(InventoryCatalogueRetry.waitsForFields.refusal != nil)
        #expect(InventoryCatalogueRetry.refused("Nope.").refusal == "Nope.")
    }

    @Test("a fitting value is quiet; every other fit says what moved")
    func fitVocabulary() {
        let blocking: [InventoryFieldFit] = [
            .archived, .optionRetired, .replaced(by: "Diagonal"), .changedKind(to: "a number"),
            .nowRequired, .notOnPhone, .recordGone, .recordNotAllowed,
        ]
        #expect(!InventoryFieldFit.fits.blocks)
        #expect(InventoryFieldFit.fits.caption == nil)
        for fit in blocking {
            #expect(fit.blocks, "\(fit)")
            #expect(fit.caption != nil, "\(fit)")
            #expect(fit.symbol != InventoryFieldFit.fits.symbol, "\(fit)")
        }
        #expect(InventoryFieldFit.replaced(by: "Diagonal").caption == "Now Diagonal")
    }

    @Test("resolving from Sync settles on the catalogue outcomes")
    func resolvesWithCatalogueOutcomes() {
        var ledger = InventorySyncLedger(repairs: Fixtures.several)
        let sent = ledger.resolve(Fixtures.shieldingArchived.id)
        let letGo = ledger.resolve(Fixtures.screenReplaced.id, keepingMine: false)

        #expect(sent?.message == "Sent with current fields")
        #expect(letGo?.message == "Let go")
        #expect(ledger.repairs.count == Fixtures.several.count - 2)
    }

    @Test("an app too old holds only the change that needs the newer fields")
    func appUpdateHoldsOnlyTheHeldChange() {
        let held = Fixtures.heldForApp.filter { $0.hold != nil }
        #expect(held.map(\.id) == [Fixtures.cableEdit.id])
        #expect(held.first?.hold == .appUpdate)
        #expect(Fixtures.movedAndSending.allSatisfy { $0.hold == nil })
        #expect(Fixtures.movedAndSending.contains { $0.progress != nil })
    }

    @Test("a change behind a repair replays after the change it waits on")
    func behindRepairOrdersAfterItsDependency() {
        let ids = InventorySyncLedger(waiting: [Fixtures.cableRename, Fixtures.cableEdit])
            .waiting.map(\.id)
        #expect(ids == [Fixtures.cableEdit.id, Fixtures.cableRename.id])
    }

    @MainActor
    @Test("the surface is catalogued with every state the ticket names")
    func surfaceIsRegistered() throws {
        let surface = try #require(
            Catalog.surfaces.first { $0.id == InventoryCatalogueRepairSurface.id })
        let ids = Set(surface.states.map(\.id))
        let named: Set<String> = [
            "updating-fields", "app-too-old", "needs-attention", "several", "item-notice",
            "field-archived", "field-replaced", "type-replaced", "retry-refused", "retried",
            "let-go", "settled", "edit-item", "blocked-after-change", "stalled", "record-gone",
            "record-not-allowed",
        ]
        #expect(named.isSubset(of: ids), "missing \(named.subtracting(ids))")
        #expect(ids.count == surface.states.count)
    }
}
