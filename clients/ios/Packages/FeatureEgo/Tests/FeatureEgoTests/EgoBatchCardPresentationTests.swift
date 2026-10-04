import AppCore
import Testing

@testable import FeatureEgo

@Suite("Ego batch card presentation")
internal struct EgoBatchCardPresentationTests {
    @Test("only pending rows expose checkboxes when decisions are available in every phase")
    func checkboxesFollowPendingRowsAndCanDecide() {
        let actions = [action("pending"), action("done", status: .executed)]
        let phases: [EgoBatchPhase] = [.idle, .working, .failed(message: "Try again.")]

        for phase in phases {
            let presentation = makePresentation(
                actions: actions,
                ticked: ["pending"],
                phase: phase,
                canDecide: true
            )
            #expect(presentation.rows.map(\.showsCheckbox) == [true, false])
            #expect(presentation.showsButtons)
        }

        let unavailable = makePresentation(
            actions: actions,
            ticked: ["pending"],
            canDecide: false
        )
        #expect(unavailable.rows.allSatisfy { !$0.showsCheckbox })
        #expect(!unavailable.showsButtons)
    }

    @Test("working disables both decisions while idle and failed allow retry")
    func buttonEnablementTracksPhaseAndSelection() {
        let working = makePresentation(phase: .working, canDecide: true)
        #expect(!working.approveEnabled)
        #expect(!working.rejectEnabled)

        let idle = makePresentation(phase: .idle, canDecide: true)
        #expect(idle.approveEnabled)
        #expect(idle.rejectEnabled)

        let failed = makePresentation(phase: .failed(message: "Retry"), canDecide: true)
        #expect(failed.approveEnabled)
        #expect(failed.rejectEnabled)

        let noSelection = makePresentation(ticked: [], canDecide: true)
        #expect(!noSelection.approveEnabled)
        #expect(noSelection.rejectEnabled)
    }

    @Test("approve title counts selected pending actions")
    func approveTitleShowsSelectedCount() {
        let presentation = makePresentation(
            actions: [action("a1"), action("a2"), action("a3")],
            ticked: ["a1", "a3"],
            canDecide: true
        )
        #expect(presentation.approveTitle == "Approve 2")
    }

    @Test("continuable batches show only the continue action")
    func continuesDecidedBatch() {
        let presentation = makePresentation(
            actions: [
                action("approved", status: .confirmed),
                action("rejected", status: .rejected),
            ],
            canDecide: true,
            canContinue: true
        )

        #expect(presentation.showsContinue)
        #expect(presentation.continueTitle == "Continue")
        #expect(!presentation.showsButtons)
        #expect(presentation.rows.allSatisfy { !$0.showsCheckbox })

        let notContinuable = makePresentation(canDecide: true)
        #expect(!notContinuable.showsContinue)
    }

    @Test("resolved statuses have distinct labels and symbols and no checkbox")
    func resolvedStatusPresentation() {
        let presentation = makePresentation(
            actions: [
                action("confirmed", status: .confirmed),
                action("executed", status: .executed),
                action("rejected", status: .rejected),
                action("failed", status: .failed),
                action("pending"),
            ],
            ticked: ["pending"],
            canDecide: true
        )
        let resolvedRows = Array(presentation.rows.prefix(4))

        #expect(resolvedRows.map(\.statusLabel) == ["Running", "Done", "Cancelled", "Failed"])
        #expect(Set(resolvedRows.compactMap(\.statusSymbol)).count == 4)
        #expect(resolvedRows.allSatisfy { !$0.showsCheckbox })
        #expect(presentation.rows[4].statusLabel == nil)
        #expect(presentation.rows[4].statusSymbol == nil)
    }

    @Test("destructive status uses the last exact tool-name segment")
    func destructiveToolClassification() {
        let actions = [
            action("delete", "inventory.items.delete"),
            action("remove", "lists.items_remove"),
            action("discard", "purchases.document.discard"),
            action("abandon", "cerebrum-engram-abandon"),
            action("disconnect", "inventory_fixtures_disconnect"),
            action("update", "inventory.items.update"),
            action("draft", "inventory.catalogue.abandonDraft"),
        ]
        let presentation = makePresentation(
            actions: actions,
            ticked: ["delete"],
            canDecide: true
        )

        #expect(
            presentation.rows.map(\.isDestructive) == [true, true, true, true, false, false, false])
        #expect(presentation.usesDestructiveRole)

        let afterUntickingDelete = makePresentation(
            actions: actions,
            ticked: ["disconnect", "update", "draft"],
            canDecide: true
        )
        #expect(!afterUntickingDelete.usesDestructiveRole)
    }

    @Test("tool options are distinct, ordered, and conversation toggle state is reflected")
    func toolOptionsFollowBatchTools() {
        let presentation = makePresentation(
            actions: [
                action("a1", "inventory.items.move"),
                action("a2", "finance.transactions.update"),
                action("a3", "inventory.items.move"),
            ],
            ticked: ["a1", "a2"],
            alwaysAllow: ["finance.transactions.update"],
            canDecide: true
        )

        #expect(
            presentation.toolOptions.map(\.tool) == [
                "inventory.items.move", "finance.transactions.update",
            ])
        #expect(
            presentation.toolOptions.map(\.label)
                == ["changes to inventory", "changes to financial data"])
        #expect(presentation.toolOptions.map(\.isOn) == [false, true])
        #expect(
            presentation.rows.map(\.toolLabel) == [
                "Changes to inventory", "Changes to financial data", "Changes to inventory",
            ])

        let resolved = makePresentation(
            actions: [action("done", status: .executed)],
            canDecide: false
        )
        #expect(resolved.toolOptions.isEmpty)
    }

    @Test("write tool labels describe the changed scope")
    func writeLabelsDescribeChangeScope() {
        let presentation = makePresentation(
            actions: [
                action("inventory", "inventory.items.delete"),
                action("notes", "cerebrum.engram.update"),
                action("unknown", "lists.items.move"),
                action("unnamed", ""),
            ],
            canDecide: true
        )

        #expect(
            presentation.rows.map(\.toolLabel) == [
                "Changes to inventory", "Changes to notes", "Changes to lists",
                "Changes to this action",
            ])
        #expect(
            presentation.toolOptions.map(\.label) == [
                "changes to inventory", "changes to notes", "changes to lists",
                "changes to this action",
            ])
    }

    @Test("failed phase exposes its message and keeps decision buttons available")
    func failurePresentationIsRetryable() {
        let presentation = makePresentation(
            phase: .failed(message: "Could not submit. Try again."),
            canDecide: true
        )

        #expect(presentation.failureMessage == "Could not submit. Try again.")
        #expect(presentation.showsButtons)
        #expect(presentation.approveEnabled)
        #expect(presentation.rejectEnabled)
    }

    private func action(
        _ id: String,
        _ tool: String = "inventory.items.move",
        status: EgoActionStatus = .pending
    ) -> EgoBatchAction {
        EgoBatchAction(actionId: id, tool: tool, summary: "Action \(id)", status: status)
    }

    private func makePresentation(
        actions: [EgoBatchAction]? = nil,
        ticked: Set<String> = ["a1", "a2"],
        alwaysAllow: Set<String> = [],
        phase: EgoBatchPhase = .idle,
        canDecide: Bool,
        canContinue: Bool = false
    ) -> EgoBatchCardPresentation {
        EgoBatchCardPresentation(
            batch: EgoActionsPart(
                batchId: "batch-1", actions: actions ?? [action("a1"), action("a2")]),
            ticked: ticked,
            alwaysAllow: alwaysAllow,
            phase: phase,
            canDecide: canDecide,
            canContinue: canContinue
        )
    }
}
