/// The six questions POPS-4016 has to answer, all open.
///
/// Each varies exactly one field of ``InventoryUntypedStyle`` and holds the
/// rest at the defaults that type documents. Where a held default changes how
/// a question reads, the variant's note says so.
///
/// What none of them varies is whether a type can be made in the product. That
/// was decided in ADR-001 and is not a knob: every variant below is an answer
/// to "a type is not here yet", never to "make one".
internal enum InventoryUntypedExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        capture, presence, queue, arrival, typing, typeChange,
    ]

    @MainActor private static let capture = DesignExperiment(
        id: "inventory-untyped-capture",
        question: "What may filing an item with no type capture beyond a name and a note?",
        subject: SurfaceID(area: "inventory", slug: "untyped-filing"),
        variants: [
            filing(
                "note-only", "Note only",
                note:
                    "Name, photo, placement, note. The narrowest reading of the decision, and the "
                    + "only one with nothing to migrate when a type arrives.",
                style: .init(capture: .noteOnly)),
            filing(
                "one-free-property", "One free fact",
                note:
                    "A single key and value beside the note. Ask whether one is a line that holds, "
                    + "or the first row of the key and value store the type model rejected.",
                style: .init(capture: .oneFreeProperty)),
            filing(
                "prompted-note", "Prompted note",
                note:
                    "The questions types ask most often, offered as prompts. Structure in the "
                    + "asking and prose in the saving.",
                style: .init(capture: .promptedNote)),
        ])

    @MainActor private static let presence = DesignExperiment(
        id: "inventory-untyped-presence",
        question: "Beside typed items, how visible should an untyped one be?",
        subject: SurfaceID(area: "inventory", slug: "untyped-item"),
        variants: [
            item(
                "row-only", "Row only",
                note:
                    "Nothing beyond the \u{201C}No type yet\u{201D} the row already prints. An "
                    + "untyped item is an ordinary item.",
                style: .init(listPresence: .rowOnly), opening: "in-a-list"),
            item(
                "badge", "A chip",
                note:
                    "An amber chip as well. Findable at a glance, at the cost of marking eleven "
                    + "rows during a move.",
                style: .init(listPresence: .badge), opening: "in-a-list"),
            item(
                "grouped", "Held apart",
                note:
                    "Untyped items in their own section under the typed ones. Comparable lists, "
                    + "and a sort order that is not the one asked for.",
                style: .init(listPresence: .grouped), opening: "in-a-list"),
        ])

    @MainActor private static let queue = DesignExperiment(
        id: "inventory-untyped-queue",
        question: "Are the things waiting for a type a place you can go, or only a filter?",
        subject: SurfaceID(area: "inventory", slug: "untyped-waiting"),
        variants: [
            waiting(
                "counted", "A counted queue",
                note:
                    "A destination with its count. Honest about the backlog, and a number nobody "
                    + "here can bring down.",
                style: .init(queue: .counted)),
            waiting(
                "filter-only", "A filter in Browse",
                note:
                    "No queue and no count. They are found by filtering, which is what POPS-3983 "
                    + "found wrong with Observed: nothing chases them.",
                style: .init(queue: .filterOnly)),
            waiting(
                "on-arrival", "Only when it matters",
                note:
                    "Nothing to see until an update covers some of them. The screen exists only "
                    + "at the moment it can be acted on.",
                style: .init(queue: .onArrival)),
        ])

    @MainActor private static let arrival = DesignExperiment(
        id: "inventory-untyped-arrival",
        question: "When an update ships a type that covers waiting items, who acts?",
        subject: SurfaceID(area: "inventory", slug: "type-arrival"),
        variants: [
            arriving(
                "silent", "The update does",
                note:
                    "Matched items are typed by the release, reversibly. Nothing to do, and three "
                    + "items changed by a guess nobody read.",
                style: .init(arrival: .silent)),
            arriving(
                "prompt", "Asked once",
                note:
                    "A notice offering the review, and a Not now that does not come back. Cheap "
                    + "to ignore, which is also how it is missed.",
                style: .init(arrival: .prompt)),
            arriving(
                "batch-review", "Only in the queue",
                note:
                    "No notice. The matches wait on the queue until somebody opens it. Nothing "
                    + "interrupts a move, and nothing reminds you either.",
                style: .init(arrival: .batchReview)),
        ])

    @MainActor private static let typing = DesignExperiment(
        id: "inventory-untyped-partial",
        question: "Is an item typed or not, or can it be partly typed?",
        subject: SurfaceID(area: "inventory", slug: "untyped-item"),
        variants: [
            item(
                "binary", "Typed or not",
                note:
                    "Two states. An empty field is an ordinary empty field, and nothing separates "
                    + "\u{201C}never asked\u{201D} from \u{201C}does not apply\u{201D}.",
                style: .init(typing: .binary), opening: "partial"),
            item(
                "partial", "Partly typed",
                note:
                    "A third state that counts unanswered fields and lists them. More to act on, "
                    + "and a second backlog beside the waiting one.",
                style: .init(typing: .partial), opening: "partial"),
        ])

    @MainActor private static let typeChange = DesignExperiment(
        id: "inventory-untyped-type-change",
        question: "A type gains a field by deploy. What do the items already on it do about it?",
        subject: SurfaceID(area: "inventory", slug: "type-arrival"),
        variants: [
            arriving(
                "announced", "Said once",
                note:
                    "A notice naming the field and the count, then nothing. The change is known "
                    + "and not tracked.",
                style: .init(typeChange: .announced), opening: "changed"),
            arriving(
                "on-the-item", "Only on the item",
                note:
                    "No announcement. The field appears empty where it applies. A deploy creates "
                    + "no work, and a change can go unnoticed for months.",
                style: .init(typeChange: .onTheItem), opening: "changed"),
            arriving(
                "review-queue", "Queued as work",
                note:
                    "Fourteen items queued beside the things waiting for a type. Answerable in a "
                    + "run, and a backlog a release can create without asking.",
                style: .init(typeChange: .reviewQueue), opening: "changed"),
        ])

    @MainActor
    private static func filing(
        _ id: String, _ title: String, note: String, style: InventoryUntypedStyle
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryUntypedStaging.filing(style: style))
    }

    @MainActor
    private static func item(
        _ id: String, _ title: String, note: String, style: InventoryUntypedStyle, opening: String
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryUntypedStaging.item(style: style, opening: opening))
    }

    @MainActor
    private static func waiting(
        _ id: String, _ title: String, note: String, style: InventoryUntypedStyle
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryUntypedStaging.waiting(style: style))
    }

    @MainActor
    private static func arriving(
        _ id: String, _ title: String, note: String, style: InventoryUntypedStyle,
        opening: String = "arrived"
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryUntypedStaging.arrival(style: style, opening: opening))
    }
}
