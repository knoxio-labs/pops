/// The four questions POPS-3980 raised about the item detail surface. Joao
/// decided all four on the device on 2026-09-16, and the screen was rebuilt
/// around the answers, so each keeps only the variant that won: a losing
/// screen kept alive is a second design somebody builds from by mistake.
internal enum InventoryItemDetailExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        hierarchy, actionPlacement, sectionDisclosure, containerExtension,
    ]

    private static let subject = SurfaceID(area: "inventory", slug: "item-detail")

    @MainActor private static let hierarchy = DesignExperiment(
        id: "item-detail-hierarchy",
        question:
            "Should every section always appear, or should an empty one disappear and a "
            + "well-documented item's sections reorder toward what it actually has?",
        subject: subject,
        status: .decided(
            variant: "richness-adaptive",
            rationale:
                "Richness-adaptive, decided on the device 2026-09-16. Sections appear as they "
                + "are needed, and all of them appear while editing, the way the iOS Contacts "
                + "app does it. The fixed-order variant is deleted."
        ),
        variants: [
            variant(
                "richness-adaptive", "Richness-adaptive",
                note: "An empty section disappears, and an item with nothing recorded shows no "
                    + "section list at all.",
                opening: "sparse")
        ]
    )

    @MainActor private static let actionPlacement = DesignExperiment(
        id: "item-detail-action-placement",
        question: "Does the placement action live in the header or in a persistent bottom bar?",
        subject: subject,
        status: .decided(
            variant: "header",
            rationale:
                "In the header, side by side, decided on the device 2026-09-16. The verbs sit "
                + "beside the identity they act on, and a capability adds its own to the same "
                + "row. The bottom-bar variant is deleted."
        ),
        variants: [
            variant(
                "header", "In the header",
                note: "One row under the facts, primary first, icon-led.",
                opening: "direct-location")
        ]
    )

    @MainActor private static let sectionDisclosure = DesignExperiment(
        id: "item-detail-section-disclosure",
        question:
            "Do provenance, documents and activity expand in place, or push to their own screen?",
        subject: subject,
        status: .decided(
            variant: "inline",
            rationale:
                "Inline, decided on the device 2026-09-16. Provenance and documents are read on "
                + "the page; only a line of history opens its own event. The drill-in variant is "
                + "deleted."
        ),
        variants: [
            variant(
                "inline", "Inline",
                note: "Everything is on the page, under the fixed header and action row.",
                opening: "rich")
        ]
    )

    @MainActor private static let containerExtension = DesignExperiment(
        id: "item-detail-container-extension",
        question:
            "How does a container-capable item's page extend an ordinary item's, without becoming "
            + "an unrelated design?",
        subject: subject,
        status: .decided(
            variant: "appended-section",
            rationale:
                "One section, appended, decided on the device 2026-09-16. A capability "
                + "contributes actions to the row and a section to the page and nothing else, so "
                + "a container's page is an item's page with its contents on the end. The "
                + "segmented-contents and separate-hero variants are deleted."
        ),
        variants: [
            variant(
                "appended-section", "One section, appended",
                note: "The identical page, plus Open, Close and a Contents section.",
                opening: "container")
        ]
    )

    @MainActor
    private static func variant(
        _ id: String,
        _ title: String,
        note: String,
        opening: String
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryItemDetailStaging.surface(opening: opening))
    }
}
