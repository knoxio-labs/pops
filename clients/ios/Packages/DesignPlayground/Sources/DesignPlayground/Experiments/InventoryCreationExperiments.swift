/// The three things POPS-3984 leaves for the device to settle: what shape the
/// create flow has, where the code suggestion lives, and when the record
/// starts existing.
///
/// Two of them sit on the same surface, which ``DesignExperiment`` allows and
/// charges for: each variant states what it holds fixed about the other. The
/// structure variants all create at the final action, and the moment variants
/// are both the scrolling form.
internal enum InventoryCreationExperiments {
    @MainActor internal static let all: [DesignExperiment] = [structure, codeAssist, moment]

    @MainActor private static let structure = DesignExperiment(
        id: "inventory-create-structure",
        question: "What shape does recording an item have on a phone?",
        subject: InventoryCreationSurfaces.createID,
        variants: [
            variant(
                .form, id: "scrolling-form", title: "One scrolling form",
                note:
                    "Every field on one screen. Scrolls at the default text size, which is the cost "
                    + "this variant is here to show rather than argue about. Creates at the final action."
            ),
            variant(
                .photoLed, id: "photo-led", title: "Photo first, then the form",
                note:
                    "The same fields in the same order with the photo strip moved above the name, so "
                    + "the first ask happens while the object is still in your hands."),
            variant(
                .steps, id: "staged", title: "Four steps",
                note:
                    "Identity, photos, placement, review. Nothing scrolls; Create is four screens in. "
                    + "Switch states to walk the steps."),
            variant(
                .sheets, id: "identity-first", title: "Identity first, the rest in sheets",
                note:
                    "A name and Create on one screen, with photos, code and placement behind three "
                    + "rows. Fastest to finish and easiest to leave empty."),
        ]
    )

    @MainActor private static let codeAssist = DesignExperiment(
        id: "inventory-code-assist-placement",
        question: "Where does the code suggestion live: in the field, or behind it?",
        subject: InventoryCreationSurfaces.codeID,
        variants: [
            DesignVariant(
                id: "inline", title: "In the field",
                note:
                    "Suggest sits beside the code field and every outcome lands under it as a note. "
                    + "Nothing to open, and nine states share one row.",
                surface: InventoryCreationSurfaces.codeSurface(inSheet: false)),
            DesignVariant(
                id: "sheet", title: "In its own sheet",
                note:
                    "The row shows the code; Suggest opens a sheet that owns the offer, the "
                    + "alternatives and the refusal. Keeps the form short, costs a tap.",
                surface: InventoryCreationSurfaces.codeSurface(inSheet: true)),
        ]
    )

    @MainActor private static let moment = DesignExperiment(
        id: "inventory-create-moment",
        question: "When does the record start existing?",
        subject: InventoryCreationSurfaces.createID,
        variants: [
            DesignVariant(
                id: "final-action", title: "At the final action",
                note:
                    "Nothing exists until Create. Cancel throws the draft away and says so. Holds "
                    + "structure at the scrolling form.",
                surface: InventoryCreationSurfaces.momentSurface(.atFinalAction)),
            DesignVariant(
                id: "first-keystroke", title: "From the first keystroke",
                note:
                    "The record exists as soon as it has a name and the rest of the form is already "
                    + "editing it. No draft to lose, and no way to change your mind without a discard.",
                surface: InventoryCreationSurfaces.momentSurface(.onFirstKeystroke)),
        ]
    )

    @MainActor
    private static func variant(
        _ structure: InventoryCreateStructure, id: String, title: String, note: String
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryCreationSurfaces.surface(structure: structure))
    }
}
