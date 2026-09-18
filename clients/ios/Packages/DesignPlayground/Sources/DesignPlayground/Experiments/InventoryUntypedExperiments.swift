/// The six questions POPS-4016 raised, all settled but one.
///
/// Five reuse the approved Items and New item form exactly as they ship: an
/// untyped item was never a screen of its own, so there is nothing to stage
/// beyond the fixture that puts it on the real surface. Only how a type
/// arriving is handled stays an experiment, and it too is now decided:
/// ``InventoryUntypedSurfaces/typeArrived`` is the winning variant, not a
/// stand-in for it.
internal enum InventoryUntypedExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        capture, presence, queue, arrival, typing, typeChange,
    ]

    private static let decidedOn = "Decided by Joao, 2026-09-17: "

    private static let itemsID = SurfaceID(area: "inventory", slug: "items")
    private static let itemCreateID = SurfaceID(area: "inventory", slug: "item-create")

    @MainActor private static var itemsFilteredToUntyped: DesignSurface {
        DesignSurface(
            id: itemsID,
            title: "Items · Filtered to untyped",
            chrome: .navigationLarge,
            states: [
                DesignState("filtered", "Filtered to untyped") {
                    InventoryItemsBrowserView(filter: InventorySearchFilter(missing: .type))
                }
            ]
        )
    }

    @MainActor private static let capture = DesignExperiment(
        id: "inventory-untyped-capture",
        question: "What may filing an item with no type capture beyond a name and a note?",
        subject: itemCreateID,
        status: .decided(
            variant: "the-form",
            rationale: decidedOn
                + "the approved New item form, with \u{201C}No type yet\u{201D}: name, photo, "
                + "placement, note. No free-form property beside it."),
        variants: [
            DesignVariant(
                id: "the-form", title: "The New item form",
                note:
                    "Nothing added to it. The one form files a typed item and an untyped one "
                    + "alike.",
                surface: DesignSurface(
                    id: itemCreateID,
                    title: "New item · No type yet",
                    chrome: .navigation,
                    states: [
                        DesignState("untyped", "No type yet") {
                            InventoryItemFormView(draft: InventoryDraftFixtures.untyped)
                        }
                    ]
                ))
        ])

    @MainActor private static let presence = DesignExperiment(
        id: "inventory-untyped-presence",
        question: "Beside typed items, how visible should an untyped one be?",
        subject: itemsID,
        status: .decided(
            variant: "row-only",
            rationale: decidedOn
                + "the row's own subtitle, \u{201C}No type yet\u{201D}, and nothing else. No chip, "
                + "no badge, everywhere an item's row appears."),
        variants: [
            DesignVariant(
                id: "row-only", title: "The row's subtitle",
                note: "Carried by InventoryItemRow already; nothing untyped needed of its own.",
                surface: itemsFilteredToUntyped)
        ])

    @MainActor private static let queue = DesignExperiment(
        id: "inventory-untyped-queue",
        question: "Are the things waiting for a type a place you can go, or only a filter?",
        subject: itemsID,
        status: .decided(
            variant: "filter-only",
            rationale: decidedOn
                + "Items' Untyped count tile and its filter. There is no queue screen."),
        variants: [
            DesignVariant(
                id: "filter-only", title: "A filter in Items",
                note: "The existing count tile plus a filter is the whole answer.",
                surface: itemsFilteredToUntyped)
        ])

    @MainActor private static let arrival = DesignExperiment(
        id: "inventory-untyped-arrival",
        question: "When an update ships a type that covers waiting items, who acts?",
        subject: InventoryUntypedSurfaces.typeArrivedID,
        status: .decided(
            variant: "prompt",
            rationale: decidedOn
                + "the phone asks once, in a compact sheet over the dashboard, with the matches "
                + "ticked and Apply in the nav bar. Not now does not come back."),
        variants: [
            DesignVariant(
                id: "prompt", title: "Asked once",
                note: "Applying leaves the undo capsule; Not now leaves nothing behind.",
                surface: InventoryUntypedSurfaces.typeArrived)
        ])

    @MainActor private static let typing = DesignExperiment(
        id: "inventory-untyped-partial",
        question: "Is an item typed or not, or can it be partly typed?",
        subject: itemsID,
        status: .decided(
            variant: "binary",
            rationale: decidedOn
                + "typed or not. An empty field is an ordinary empty field; there is no partial "
                + "state and nothing counts unanswered fields."),
        variants: [
            DesignVariant(
                id: "binary", title: "Typed or not",
                note: "Typed and untyped items sit in the same list, told apart only by the row.",
                surface: DesignSurface(
                    id: itemsID,
                    title: "Items",
                    chrome: .navigationLarge,
                    states: [DesignState.standard { InventoryItemsBrowserView() }]
                ))
        ])

    @MainActor private static let typeChange = DesignExperiment(
        id: "inventory-untyped-type-change",
        question: "A type gains a field by deploy. What do the items already on it do about it?",
        subject: itemsID,
        status: .archived(
            reason:
                "Joao, 2026-09-17: what a shipped type change does to items already on it is a "
                + "migration concern, not a screen. The draft screen this raised is gone."),
        variants: [
            DesignVariant(
                id: "no-screen", title: "No screen",
                note:
                    "The items just show the field a migration filled in, same as any other "
                    + "field. Nothing on the phone marks that a deploy touched them.",
                surface: itemsFilteredToUntyped)
        ])
}
