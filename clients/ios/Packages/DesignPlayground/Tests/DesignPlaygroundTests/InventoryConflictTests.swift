import Testing

@testable import DesignPlayground

/// The repair contract, asserted rather than trusted to prose.
///
/// Three promises, and each has a plausible way of being broken by someone
/// adding a tenth kind of conflict in a hurry: a repair that offers nothing, a
/// repair that leads with the option that throws work away, and a repair that
/// cannot be left for later.
@Suite("Inventory conflicts")
internal struct InventoryConflictTests {
    private var everyKind: [InventoryConflictKind] { InventoryConflictKind.allCases }

    @Test("every kind of disagreement offers a way out")
    func noDeadEnds() {
        for kind in everyKind {
            #expect(
                InventoryResolutions.offered(for: kind).count >= 2,
                "\(kind.rawValue) offers fewer than two ways out, so it is a notification")
        }
    }

    @Test("every kind says what happened before it offers anything")
    func everyKindStatesTheDisagreement() {
        for kind in everyKind {
            #expect(!kind.headline.isEmpty)
            #expect(!kind.disagreement.isEmpty)
            #expect(
                kind.disagreement.count > kind.headline.count,
                "\(kind.rawValue) restates its headline instead of saying what disagreed")
        }
    }

    @Test("every resolution says what it will do, not only what it is called")
    func everyResolutionStatesItsOutcome() {
        for kind in everyKind {
            for resolution in InventoryResolutions.offered(for: kind) {
                #expect(!resolution.outcome.isEmpty, "\(kind.rawValue)/\(resolution.id)")
                #expect(resolution.outcome != resolution.title)
            }
        }
    }

    @Test("nothing that loses work is offered first")
    func leadingResolutionNeverLosesWork() {
        for kind in everyKind {
            let leading = InventoryResolutions.offered(for: kind).first

            #expect(leading?.effect != .discardsIntent, "\(kind.rawValue) leads with a loss")
            #expect(leading?.effect != .postpones, "\(kind.rawValue) leads with doing nothing")
        }
    }

    @Test("at most one resolution per repair throws the local change away")
    func atMostOneDiscard() {
        for kind in everyKind {
            let discards = InventoryResolutions.offered(for: kind)
                .filter { $0.effect == .discardsIntent }

            #expect(discards.count <= 1, "\(kind.rawValue) offers \(discards.count) ways to lose")
        }
    }

    @Test("every repair can be left for later, and that is always the last option")
    func postponeIsAlwaysLast() {
        for kind in everyKind {
            let offered = InventoryResolutions.offered(for: kind)
            let postponing = offered.filter { $0.effect == .postpones }

            #expect(postponing.count == 1, "\(kind.rawValue) offers \(postponing.count) ways out")
            #expect(offered.last?.effect == .postpones, "\(kind.rawValue) buries Not now")
        }
    }

    @Test("a repair whose target is gone can rebuild it rather than only drop the change")
    func deletionOffersRestoration() {
        let effects = InventoryResolutions.offered(for: .remoteDeletion).map(\.effect)

        #expect(effects.contains(.restoresTarget))
        #expect(effects.first == .restoresTarget)
    }

    @Test("a code collision can keep both records")
    func collisionKeepsBoth() {
        let effects = InventoryResolutions.offered(for: .codeCollision).map(\.effect)

        #expect(effects.contains(.keepsBoth))
        #expect(!effects.contains(.discardsIntent))
    }

    @Test("a repair with one side offers no way to take the other side's value")
    func onesidedRepairsOfferNoServerValue() {
        for kind in [InventoryConflictKind.expiredSession, .storageFull, .unsupportedContract] {
            let effects = InventoryResolutions.offered(for: kind).map(\.effect)

            #expect(
                !effects.contains(.keepsServer), "\(kind.rawValue) offers a value it has not got")
            #expect(
                !effects.contains(.discardsIntent), "\(kind.rawValue) can lose work for nothing")
        }
    }

    @Test("only the repairs that stop everything are candidates for interrupting")
    func queueStoppingIsTheNarrowSet() {
        let stopping = everyKind.filter(\.stopsTheQueue)

        #expect(Set(stopping) == [.expiredSession, .storageFull, .unsupportedContract])
    }

    @Test("an interruption rule lets through exactly what it says")
    func interruptionRules() {
        let single = InventorySyncFixtures.concurrentEdit
        let stopping = InventorySyncFixtures.expiredSession

        #expect(!InventorySyncStyle.Interruption.never.interrupts(stopping))
        #expect(!InventorySyncStyle.Interruption.queueStoppingOnly.interrupts(single))
        #expect(InventorySyncStyle.Interruption.queueStoppingOnly.interrupts(stopping))
        #expect(InventorySyncStyle.Interruption.anyRepair.interrupts(single))
    }

    @Test("a repair that holds others back says so, and one that does not stays quiet")
    func summaryNamesWhatIsWaiting() {
        #expect(InventorySyncFixtures.concurrentEdit.summary.contains("2 later changes"))
        #expect(!InventorySyncFixtures.codeCollision.summary.contains("later changes"))
    }

    @Test("every fixture repair names the item it is about")
    func everyFixtureNamesItsItem() {
        for conflict in InventorySyncFixtures.everyRepair {
            #expect(!conflict.item.name.isEmpty)
            #expect(conflict.leading != nil)
        }
    }

    @Test("every kind of disagreement has a fixture to look at")
    func everyKindIsDrawable() {
        for kind in everyKind {
            #expect(InventorySyncFixtures.repair(for: kind).kind == kind)
        }
    }
}
