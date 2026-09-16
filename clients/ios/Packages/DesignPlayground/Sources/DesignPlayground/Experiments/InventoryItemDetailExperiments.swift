/// The four questions POPS-3980 leaves open, all live on the item detail
/// surface. Each varies exactly one field of ``InventoryItemDetailStyle`` and
/// holds the rest at their defaults, the same discipline
/// ``InventoryFoundationExperiments`` uses. Joao decides on the device; none
/// of these are marked `.decided`.
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
        variants: [
            variant(
                "fixed-order", "Fixed order",
                note:
                    "Every section appears, empty ones say \"not recorded\". A sparse item's page "
                    + "is long, but nothing about it looks like a different design from a rich one's.",
                style: .init(hierarchy: .fixedOrder), opening: "sparse"),
            variant(
                "richness-adaptive", "Richness-adaptive",
                note:
                    "An empty section disappears, so a sparse item's page stays short. Costs "
                    + "predictability: the same section is not always in the same place.",
                style: .init(hierarchy: .richnessAdaptive), opening: "sparse"),
        ]
    )

    @MainActor private static let actionPlacement = DesignExperiment(
        id: "item-detail-action-placement",
        question: "Does the placement action live in the header or in a persistent bottom bar?",
        subject: subject,
        variants: [
            variant(
                "header", "In the header",
                note: "Beside the identity it acts on. Scrolls away with the rest of the page.",
                style: .init(actionPlacement: .header), opening: "direct-location"),
            variant(
                "bottom-bar", "Persistent bottom bar",
                note: "Always reachable, at the cost of a fixed strip on every state, including "
                    + "ones a destroyed item has nothing to put there.",
                style: .init(actionPlacement: .bottomBar), opening: "direct-location"),
        ]
    )

    @MainActor private static let sectionDisclosure = DesignExperiment(
        id: "item-detail-section-disclosure",
        question:
            "Do provenance, documents and activity expand in place, or push to their own screen?",
        subject: subject,
        variants: [
            variant(
                "inline", "Inline, expandable",
                note:
                    "Everything stays on one page. A rich item's page is the longest scroll here.",
                style: .init(sectionDisclosure: .inlineExpandable), opening: "rich"),
            variant(
                "drill-in", "Drill in",
                note: "Each section is a row leading to its own screen. Shorter page, one more tap "
                    + "to read any of them.",
                style: .init(sectionDisclosure: .drillIn), opening: "rich"),
        ]
    )

    @MainActor private static let containerExtension = DesignExperiment(
        id: "item-detail-container-extension",
        question:
            "How does a container-capable item's page extend an ordinary item's, without becoming "
            + "an unrelated design?",
        subject: subject,
        variants: [
            variant(
                "appended-section", "One section, appended",
                note: "The identical page, plus a Container section. The smallest extension that "
                    + "still says what the item can do.",
                style: .init(containerExtension: .appendedSection), opening: "container"),
            variant(
                "segmented-contents", "Segmented contents",
                note: "A segmented control swaps the section list for the contents list, in place. "
                    + "Reuses the page rather than adding to it, at the cost of hiding the item's "
                    + "own sections while contents shows.",
                style: .init(containerExtension: .segmentedContents), opening: "container"),
            variant(
                "separate-hero", "Separate hero",
                note: "A container-only header replaces the identity header outright. Included to "
                    + "show what breaks: a box no longer reads as the same kind of page as a "
                    + "television, which is what this question exists to rule out.",
                style: .init(containerExtension: .separateHero), opening: "container"),
        ]
    )

    @MainActor
    private static func variant(
        _ id: String,
        _ title: String,
        note: String,
        style: InventoryItemDetailStyle,
        opening: String
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryItemDetailStaging.surface(style: style, opening: opening))
    }
}
