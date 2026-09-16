/// The five questions POPS-3988 leaves for the device.
///
/// What is not here matters as much as what is. How invisible healthy queued
/// work should be was asked and answered on 2026-09-16, queued and
/// synchronizing carry a quiet cloud, and the sync tiers themselves are
/// ADR-001's. Reopening either would be asking the same question twice with
/// different words.
///
/// Each experiment varies one field of ``InventorySyncStyle`` and holds the
/// rest at their defaults, and each names the state that answers it, because a
/// variant is shown opening state first.
internal enum InventorySyncExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        globalStatus, repairPlacement, conflictTreatment, interruption, staleDisclosure,
    ]

    @MainActor private static let globalStatus = DesignExperiment(
        id: "inventory-sync-global-status",
        question: "Where should sync state reach someone who is not on the dashboard?",
        subject: SurfaceID(area: "inventory", slug: "catalogue"),
        variants: [
            catalogue(
                "capsule", "A capsule in the header",
                note:
                    "The dashboard's own capsule, repeated on the list it applies to. One vocabulary "
                    + "everywhere; costs a control in the header of every screen.",
                style: .init(globalStatus: .capsule)),
            catalogue(
                "banner", "A banner above the list",
                note:
                    "A line across the top saying what is happening and how much is waiting. "
                    + "Unmissable, and it pushes the catalogue down on every offline screen.",
                style: .init(globalStatus: .banner)),
            catalogue(
                "activity-row", "An entry in recent work",
                note:
                    "Losing the connection is something that happened, filed with everything else "
                    + "that did. The calmest, and the easiest to never see.",
                style: .init(globalStatus: .activityRow)),
            catalogue(
                "destination-only", "Nowhere but Sync and repair",
                note:
                    "The list says nothing at all; rows still carry their own marks. The floor: if "
                    + "this reads as trustworthy, everything above it is decoration.",
                style: .init(globalStatus: .destinationOnly)),
        ]
    )

    @MainActor private static let repairPlacement = DesignExperiment(
        id: "inventory-sync-repair-placement",
        question: "Should a repair be offered where the item is, or only where repairs are kept?",
        subject: SurfaceID(area: "inventory", slug: "catalogue"),
        variants: [
            catalogue(
                "inbox", "In one place",
                note:
                    "A single row leads to Sync and repair; the catalogue stays a catalogue. "
                    + "Nothing is fixed in passing.",
                style: .init(repairPlacement: .inbox), opening: "repairs"),
            catalogue(
                "inline", "On the row it belongs to",
                note:
                    "The repair sits in the list beside the item. Fixable while standing in front of "
                    + "the thing; the list is no longer only a list.",
                style: .init(repairPlacement: .inline), opening: "repairs"),
            catalogue(
                "both", "Both",
                note:
                    "Inline where you are, and collected where you go looking. Two places to see the "
                    + "same five problems, which may read as ten.",
                style: .init(repairPlacement: .both), opening: "repairs"),
        ]
    )

    @MainActor private static let conflictTreatment = DesignExperiment(
        id: "inventory-sync-conflict-treatment",
        question: "How should two values that cannot both be true be put to a person?",
        subject: SurfaceID(area: "inventory", slug: "repair"),
        variants: [
            repair(
                "side-by-side", "Side by side",
                note:
                    "Both values in one row under the field. Fastest to compare; halves the width a "
                    + "place name has.",
                style: .init(conflictTreatment: .sideBySide), opening: "device-divergence"),
            repair(
                "stacked", "One above the other",
                note:
                    "Full width each, labelled by where it came from. Costs height, reads at any "
                    + "text size.",
                style: .init(conflictTreatment: .stacked), opening: "device-divergence"),
            repair(
                "field-merge", "A choice per field",
                note:
                    "Pick a side for the name and a side for the place. The only one that can end "
                    + "somewhere neither device was, and the only one that needs the idea of a field.",
                style: .init(conflictTreatment: .fieldMerge), opening: "device-divergence"),
            repair(
                "edit-final", "Type the answer",
                note:
                    "Neither value wins unless it is typed again. Honest about where the truth is; "
                    + "turns every repair into data entry.",
                style: .init(conflictTreatment: .editFinal), opening: "device-divergence"),
        ]
    )

    @MainActor private static let interruption = DesignExperiment(
        id: "inventory-sync-interruption",
        question: "What earns the right to interrupt somebody mid-task?",
        subject: SurfaceID(area: "inventory", slug: "catalogue"),
        variants: [
            catalogue(
                "queue-stopping", "Only what stops everything",
                note:
                    "An expired session, a full disk, an app too old. One disagreement about one "
                    + "item waits in the inbox.",
                style: .init(interruption: .queueStoppingOnly), opening: "queue-stopped"),
            catalogue(
                "never", "Nothing does",
                note:
                    "Every repair waits to be found. Calmest possible; a session that expired on "
                    + "Friday is discovered on Monday.",
                style: .init(interruption: .never), opening: "queue-stopped"),
            catalogue(
                "any-repair", "Any repair does",
                note:
                    "The first disagreement takes the top of the screen. Nothing is missed, and "
                    + "unpacking day is a sequence of cards.",
                style: .init(interruption: .anyRepair), opening: "repairs"),
        ]
    )

    @MainActor private static let staleDisclosure = DesignExperiment(
        id: "inventory-sync-stale-disclosure",
        question: "How should the age of an answer be disclosed while searching or scanning?",
        subject: SurfaceID(area: "inventory", slug: "lookup"),
        variants: [
            lookup(
                "age-on-row", "Under the result it applies to",
                note:
                    "Each old result says how old it is. Precise per row; repeats itself down a "
                    + "list where everything is equally old.",
                style: .init(staleDisclosure: .ageOnRow)),
            lookup(
                "banner", "Once, above the results",
                note:
                    "One sentence for the whole answer. Said once, and it cannot distinguish the "
                    + "result from twelve minutes ago from the one from four days ago.",
                style: .init(staleDisclosure: .bannerOverResults)),
            lookup(
                "glyph-only", "The row's own stale mark",
                note:
                    "No extra words: the foundation's stale glyph, already decided, and nothing "
                    + "else. Quietest, and it never says how old.",
                style: .init(staleDisclosure: .glyphOnly)),
        ]
    )

    @MainActor
    private static func catalogue(
        _ id: String, _ title: String, note: String, style: InventorySyncStyle,
        opening: String = "offline"
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventorySyncStaging.catalogueSurface(style: style, opening: opening))
    }

    @MainActor
    private static func repair(
        _ id: String, _ title: String, note: String, style: InventorySyncStyle,
        opening: String
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventorySyncStaging.repairSurface(style: style, opening: opening))
    }

    @MainActor
    private static func lookup(
        _ id: String, _ title: String, note: String, style: InventorySyncStyle
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventorySyncStaging.lookupSurface(style: style))
    }
}
