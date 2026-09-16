/// The objects the four `field-*` experiments are staged against.
///
/// Each fixture exists to make one ``InventoryFieldValidation`` outcome true
/// of a real item rather than a description of one: a bulb that really does
/// carry a fitting its type no longer lists, a tape whose width really was
/// written in a unit the field can convert, and a sideboard mid-edit against
/// a choice list long enough that "how is a long list shown" is a real
/// question rather than a hypothetical.
internal enum InventoryFieldFixtures {
    /// Recorded when the Fitting list still had four entries. The type has
    /// since dropped E14, decided pre-emptively today rather than staged as a
    /// hypothetical: a field's list changing is exactly what this experiment
    /// is about, so leaving it undated would be shipping the same hole the
    /// ticket found.
    internal static let driftedBulb = InventoryThing(
        id: "bulb-e14",
        name: "Candle bulb, E14",
        symbol: "lightbulb",
        location: "Spares 03 · Hall cupboard",
        category: "Light bulb",
        template: InventoryPropertyTemplates.bulb,
        properties: [
            InventoryProperty("Fitting", .choice("E14")),
            InventoryProperty("Protocol", .choice("None")),
            InventoryProperty("Brightness", .measure(250, unit: "lm")),
            InventoryProperty("Colour temperature", .span(low: 2700, high: 2700, unit: "K")),
            InventoryProperty("Dimmable", .flag(false)),
        ],
        tags: ["small fitting"],
        notes: "From the chandelier. Nothing in the house takes E14 any more.",
        suggestions: []
    )

    /// The same bulb, before the list narrowed, for a screen that has to show
    /// both sides of the change rather than only its casualty.
    internal static let driftedBulbField = InventoryTemplateField(
        "Fitting", "Choice", choices: ["E27", "GU10", "B22", "E14"])

    /// Mid-edit: a fitting has been typed that the current list does not
    /// contain. What happens next is the whole question the validation-outcome
    /// experiment answers three different ways.
    internal static let enteringUnknownFitting = InventoryThing(
        id: "bulb-e27-2",
        name: "Smart bulb, unlabelled",
        symbol: "lightbulb",
        location: "In hand",
        category: "Light bulb",
        template: InventoryPropertyTemplates.bulb,
        properties: [
            InventoryProperty("Fitting", .choice("E5")),
            InventoryProperty("Protocol", .choice("Wi-Fi")),
        ],
        tags: [],
        notes: "",
        suggestions: []
    )

    /// A sideboard mid-edit against Furniture's Material field, which the
    /// choice-list experiment gave a deliberately long list, twelve entries,
    /// long enough that a plain inline list of options would push the rest of
    /// the screen off a 393pt phone.
    internal static let choosingMaterial = InventoryThing(
        id: "sideboard-2",
        name: "Sideboard, unfinished",
        symbol: "cabinet",
        location: "In hand",
        category: "Furniture",
        template: InventoryPropertyTemplates.furniture,
        properties: [
            InventoryProperty("Footprint", .text("1400 × 450 × 800"))
        ],
        tags: [],
        notes: "",
        suggestions: []
    )

    /// Two tapes recording the same field in two units: one the catalogue can
    /// convert because both units share a dimension, one it cannot because
    /// the second is not in ``InventoryUnit/known`` at all.
    internal static let tapeInCentimetres = InventoryThing(
        id: "tape-electrical",
        name: "Electrical tape, red",
        symbol: "circle.dashed",
        location: "Garage tools · Garage",
        category: "Tape",
        template: InventoryPropertyTemplates.tape,
        properties: [
            InventoryProperty("Use", .choice("Insulating")),
            InventoryProperty("Width", .measure(1.9, unit: "cm")),
            InventoryProperty("Length", .measure(10, unit: "m")),
            InventoryProperty("Leaves residue", .flag(true)),
        ],
        tags: ["insulates"],
        notes: "",
        suggestions: []
    )

    internal static let tapeInUnknownUnit = InventoryThing(
        id: "tape-imported",
        name: "Tape, imported",
        symbol: "circle.dashed",
        location: "Garage tools · Garage",
        category: "Tape",
        template: InventoryPropertyTemplates.tape,
        properties: [
            InventoryProperty("Use", .choice("Gaffer")),
            InventoryProperty("Width", .measure(0.75, unit: "in")),
            InventoryProperty("Length", .measure(10, unit: "m")),
            InventoryProperty("Leaves residue", .flag(false)),
        ],
        tags: [],
        notes: "Box was labelled in inches.",
        suggestions: []
    )

    /// A search for tape by width, written in a unit the field does not
    /// store in but can convert from.
    internal static let widthSearch = InventoryPropertyClause(
        key: "Width", comparison: .atLeast, value: "15")
}
