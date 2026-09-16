import SwiftUI

/// Recording an item, from the first keystroke to the correction a minute
/// later.
///
/// Four surfaces rather than one with twenty states: entering, labelling, what
/// the final action left behind, and coming back to fix it are four things a
/// reviewer looks at separately, and a single surface carrying all of them
/// makes the state switcher the thing being reviewed.
@MainActor
internal enum InventoryCreationSurfaces {
    internal static let surfaces: [DesignSurface] = [create, code, created, edit]

    internal static let createID = SurfaceID(area: "inventory", slug: "item-create")
    internal static let codeID = SurfaceID(area: "inventory", slug: "item-code")

    internal static let create = DesignSurface(
        id: createID,
        title: "New item",
        synopsis:
            "Entering an item from a container. Only a name is required; the record exists at the "
            + "final action and everything typed is held until then.",
        chrome: .navigation,
        states: createStates(InventoryCreateStructure.form)
    )

    internal static let code = DesignSurface(
        id: codeID,
        title: "Labelling",
        synopsis: "Every state the code suggestion can leave the field in, including refusing.",
        chrome: .navigation,
        states: codeStates(inSheet: false)
    )

    internal static let created = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "item-created"),
        title: "Created",
        synopsis: "What the final action left behind, and the correction offered beside it.",
        chrome: .navigation,
        states: [
            DesignState("created", "Created") {
                InventoryCreateOutcomeView(
                    draft: InventoryDraftFixtures.ready, outcome: .created(.saved))
            },
            DesignState("queued", "Queued") {
                InventoryCreateOutcomeView(
                    draft: InventoryDraftFixtures.ready, outcome: .created(.queued))
            },
            DesignState("syncing", "Syncing") {
                InventoryCreateOutcomeView(
                    draft: InventoryDraftFixtures.ready, outcome: .created(.synchronizing))
            },
            DesignState("photos-partial", "Some photos still going") {
                InventoryCreateOutcomeView(
                    draft: InventoryDraftFixtures.partialUpload, outcome: .created(.synchronizing))
            },
            DesignState("validation-changed", "The server disagreed") {
                InventoryCreateOutcomeView(
                    draft: InventoryDraftFixtures.ready,
                    outcome: .validationChanged(field: "Type", serverValue: "Appliance"))
            },
            DesignState("repair", "Needs a choice") {
                InventoryCreateOutcomeView(
                    draft: InventoryDraftFixtures.ready,
                    outcome: .repairRequired(
                        "The code was taken by another phone while this was queued."))
            },
        ]
    )

    internal static let edit = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "item-edit"),
        title: "Edit item",
        synopsis:
            "The same fields, on an item that already exists. The internal id never edits; an "
            + "unlabelled item can still be labelled.",
        chrome: .navigation,
        states: [
            DesignState("labelled", "Already labelled") {
                InventoryEditView(item: InventoryFoundationFixtures.espresso)
            },
            DesignState("unlabelled", "No code yet") {
                InventoryEditView(item: InventoryFoundationFixtures.cable)
            },
            DesignState("enriching", "Adding what was skipped") {
                InventoryEditView(
                    item: InventoryFoundationFixtures.cable,
                    draft: InventoryDraftFixtures.multiPhoto)
            },
            DesignState("queued", "An edit that has not left the phone") {
                InventoryEditView(item: InventoryFoundationFixtures.screws)
            },
        ]
    )

    /// The create surface as one structural variant would have it, opening on
    /// the state that shows the difference.
    @MainActor
    internal static func surface(
        structure: InventoryCreateStructure, opening: String = "partial"
    ) -> DesignSurface {
        DesignSurface(
            id: createID, title: create.title, synopsis: create.synopsis, chrome: .navigation,
            states: ordered(createStates(structure), opening: opening))
    }

    @MainActor
    internal static func momentSurface(_ moment: InventoryCreateMoment) -> DesignSurface {
        let states = InventoryCreateCase.all.map { entry in
            DesignState(entry.id, entry.title) {
                InventoryCreateFormView(
                    draft: entry.draft, resumed: entry.resumed, moment: moment,
                    cancelling: entry.cancelling)
            }
        }
        return DesignSurface(
            id: createID, title: create.title, synopsis: create.synopsis, chrome: .navigation,
            states: ordered(states, opening: "ready"))
    }

    @MainActor
    internal static func codeSurface(inSheet: Bool) -> DesignSurface {
        DesignSurface(
            id: codeID, title: code.title, synopsis: code.synopsis, chrome: .navigation,
            states: codeStates(inSheet: inSheet))
    }

    private static func ordered(_ states: [DesignState], opening: String) -> [DesignState] {
        states.filter { $0.id == opening } + states.filter { $0.id != opening }
    }

    @MainActor
    internal static func codeStates(inSheet: Bool) -> [DesignState] {
        InventoryCodeCase.all.map { entry in
            DesignState(entry.id, entry.title) {
                InventoryCodeAssistView(
                    draft: InventoryDraftFixtures.withCode(entry.assist, value: entry.value),
                    inSheet: inSheet)
            }
        }
    }

    @MainActor
    internal static func createStates(_ structure: InventoryCreateStructure) -> [DesignState] {
        InventoryCreateCase.all.map { entry in
            DesignState(entry.id, entry.title) { structure.view(for: entry) }
        }
    }
}
