import AppCore
import Testing

/// ADR-002 D3: destroyed is a fact about the world, not a decision, so
/// nothing restores it; every other transition was a choice and can be
/// walked back.
@Suite("Inventory lifecycle restorability")
internal struct InventoryLifecycleRestorabilityTests {
    @Test(
        "only destroyed and active offer no restore",
        arguments: [
            (InventoryLifecycle.active, false),
            (.retired, true),
            (.discarded, true),
            (.lost, true),
            (.destroyed, false),
        ]
    )
    func restorability(lifecycle: InventoryLifecycle, expected: Bool) {
        #expect(lifecycle.isRestorable == expected)
    }

    @Test("an unrecognised lifecycle offers no restore, the same as destroyed")
    func unrecognisedIsNotRestorable() {
        #expect(InventoryLifecycle.unrecognised("archived").isRestorable == false)
    }

    @Test("only active counts towards totals")
    func countsTowardTotals() {
        #expect(InventoryLifecycle.active.countsTowardTotals)
        for lifecycle: InventoryLifecycle in [.retired, .discarded, .lost, .destroyed] {
            #expect(!lifecycle.countsTowardTotals)
        }
        #expect(!InventoryLifecycle.unrecognised("archived").countsTowardTotals)
    }
}

/// D10: lifecycle, event kind, discard reason and repair kind are open
/// strings on the wire so a server deploy can add one without an app release
/// being required for every additive case.
@Suite("Inventory wire decoding keeps what it does not recognise")
internal struct InventoryWireDecodingTests {
    @Test(
        "every lifecycle the pillar publishes maps to a case",
        arguments: [
            ("active", InventoryLifecycle.active),
            ("retired", .retired),
            ("discarded", .discarded),
            ("lost", .lost),
            ("destroyed", .destroyed),
        ]
    )
    func knownLifecyclesMap(wire: String, expected: InventoryLifecycle) {
        #expect(InventoryLifecycle(wire: wire) == expected)
    }

    @Test("a lifecycle this build has never heard of is kept, not discarded")
    func unknownLifecycleIsKept() {
        #expect(InventoryLifecycle(wire: "archived") == .unrecognised("archived"))
    }

    @Test(
        "every discard reason the pillar publishes maps to a case",
        arguments: [
            ("donated", InventoryDiscardReason.donated),
            ("sold", .sold),
            ("used_up", .usedUp),
            ("broken", .broken),
            ("gave_away", .gaveAway),
        ]
    )
    func knownDiscardReasonsMap(wire: String, expected: InventoryDiscardReason) {
        #expect(InventoryDiscardReason(wire: wire) == expected)
    }

    @Test("an unknown discard reason is kept, not discarded")
    func unknownDiscardReasonIsKept() {
        #expect(InventoryDiscardReason(wire: "recycled") == .unrecognised("recycled"))
    }

    @Test(
        "every event kind the pillar publishes maps to a case",
        arguments: [
            ("created", InventoryEventKind.created),
            ("moved", .moved),
            ("lifecycle_changed", .lifecycleChanged),
        ]
    )
    func knownEventKindsMap(wire: String, expected: InventoryEventKind) {
        #expect(InventoryEventKind(wire: wire) == expected)
    }

    @Test("an unknown event kind is kept, not discarded")
    func unknownEventKindIsKept() {
        #expect(InventoryEventKind(wire: "renamed_by_ai") == .unrecognised("renamed_by_ai"))
    }

    @Test(
        "every conflict outcome kind maps to a repair kind",
        arguments: [
            ("field", InventoryRepairKind.conflict),
            ("code_collision", .codeCollision),
            ("deleted", .deletedElsewhere),
        ]
    )
    func knownRepairKindsMap(wireOutcomeKind: String, expected: InventoryRepairKind) {
        #expect(InventoryRepairKind(wireOutcomeKind: wireOutcomeKind) == expected)
    }

    @Test("an unknown outcome kind becomes an unrecognised repair, not a crash")
    func unknownRepairKindIsKept() {
        #expect(
            InventoryRepairKind(wireOutcomeKind: "quorum_failure")
                == .unrecognised("quorum_failure"))
    }

    @Test("an unknown rejected reason is kept, not discarded")
    func unknownRejectedReasonIsKept() {
        #expect(InventoryRejectedReason(wire: "quota_exceeded") == .unrecognised("quota_exceeded"))
    }
}
