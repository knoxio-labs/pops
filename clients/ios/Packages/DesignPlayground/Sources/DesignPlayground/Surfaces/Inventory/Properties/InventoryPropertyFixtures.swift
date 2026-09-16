/// The objects every variant is drawn against, cables aside.
///
/// Identical across the five, because two designs shown different data are not
/// comparable and a reviewer will notice the data instead of the design. The
/// set is chosen to be awkward on purpose: a bulb whose useful fact is a
/// protocol, a sideboard with almost nothing, and an adapter nobody has
/// categorised. The cables are next door in ``InventoryCableFixtures``.
internal enum InventoryPropertyFixtures {
    internal static let bulb = InventoryThing(
        id: "bulb-e27",
        name: "Smart bulb, E27",
        symbol: "lightbulb",
        location: "Spares 03 · Hall cupboard",
        category: "Light bulb",
        template: InventoryPropertyTemplates.bulb,
        properties: [
            InventoryProperty("Fitting", .choice("E27")),
            InventoryProperty("Protocol", .choice("Zigbee")),
            InventoryProperty("Brightness", .measure(806, unit: "lm")),
            InventoryProperty("Colour temperature", .span(low: 2200, high: 6500, unit: "K")),
            InventoryProperty("Dimmable", .flag(true)),
            InventoryProperty("Paired to", .text("Living room lamp"), origin: .custom),
        ],
        tags: ["zigbee", "warm to cool", "spare"],
        notes: "Pairs to the Zigbee stick, not to Wi-Fi. Two left in the box.",
        suggestions: []
    )

    internal static let tape = InventoryThing(
        id: "tape-gaffer",
        name: "Gaffer tape, black",
        symbol: "circle.dashed",
        location: "Garage tools · Garage",
        category: "Tape",
        template: InventoryPropertyTemplates.tape,
        properties: [
            InventoryProperty("Use", .choice("Gaffer")),
            InventoryProperty("Width", .measure(50, unit: "mm")),
            InventoryProperty("Length", .measure(50, unit: "m")),
            InventoryProperty("Leaves residue", .flag(false)),
        ],
        tags: ["safe on paint", "matte", "tears by hand"],
        notes: "The one that comes off a wall cleanly. Not the silver duct tape.",
        suggestions: []
    )

    internal static let box = InventoryThing(
        id: "box-heavy",
        name: "Heavy-duty crate, 52 L",
        symbol: "shippingbox",
        location: "Garage",
        category: "Storage box",
        template: InventoryPropertyTemplates.container,
        properties: [
            InventoryProperty("Capacity", .measure(52, unit: "L")),
            InventoryProperty("Load limit", .measure(30, unit: "kg")),
            InventoryProperty("Footprint", .text("600 × 400 × 320")),
            InventoryProperty("Stackable", .flag(true)),
        ],
        tags: ["heavy duty", "stacks", "lid clips"],
        notes: "Books go in these. Four of them, all the same size.",
        suggestions: []
    )

    /// Almost no structured data, and no template that would improve on that.
    /// The variant that cannot draw this without looking empty has told the
    /// reviewer something.
    internal static let sideboard = InventoryThing(
        id: "sideboard",
        name: "Oak sideboard",
        symbol: "cabinet",
        location: "Living room",
        category: "Furniture",
        template: nil,
        properties: [],
        tags: ["heavy", "two people"],
        notes: "Doesn't come apart. Measure the stairwell before the move.",
        suggestions: []
    )

    /// Uncategorised, carrying a key from a template that no longer exists.
    internal static let adapter = InventoryThing(
        id: "adapter-unknown",
        name: "Barrel adapter, unlabelled",
        symbol: "powerplug",
        location: "Office 04 · Study",
        category: "Uncategorised",
        template: nil,
        properties: [
            InventoryProperty("pinout", .text("centre positive"), origin: .legacy),
            InventoryProperty("Output", .measure(12, unit: "V"), origin: .custom),
        ],
        tags: [],
        notes: "",
        suggestions: [
            InventoryProperty("Power", .measure(24, unit: "W"), origin: .suggested(.guess))
        ]
    )

    /// Being created: nothing entered yet, and inference has proposed a
    /// template and four fields off the name and the photo.
    internal static let arriving = InventoryThing(
        id: "charger-65w",
        name: "GaN charger, 65 W",
        symbol: "powerplug.portrait",
        location: "In hand",
        category: "Charger",
        template: InventoryPropertyTemplates.charger,
        properties: [],
        tags: [],
        notes: "",
        suggestions: [
            InventoryProperty("Power", .measure(65, unit: "W"), origin: .suggested(.certain)),
            InventoryProperty("Ports", .text("2 × USB-C, 1 × USB-A"), origin: .suggested(.likely)),
            InventoryProperty("Plug", .choice("Type I"), origin: .suggested(.likely)),
            InventoryProperty("Folding pins", .flag(true), origin: .suggested(.guess)),
        ]
    )

    /// Mid-edit: two suggestions accepted, two still pending, one custom key
    /// added, and one value carrying a unit the catalogue does not know.
    internal static let editing = InventoryThing(
        id: "charger-65w",
        name: "GaN charger, 65 W",
        symbol: "powerplug.portrait",
        location: "In hand",
        category: "Charger",
        template: InventoryPropertyTemplates.charger,
        properties: [
            InventoryProperty("Power", .measure(65, unit: "W")),
            InventoryProperty("Ports", .text("2 × USB-C, 1 × USB-A")),
            InventoryProperty("Cable length", .measure(4, unit: "ft"), origin: .custom),
        ],
        tags: ["travel", "fast"],
        notes: "",
        suggestions: [
            InventoryProperty("Plug", .choice("Type I"), origin: .suggested(.likely)),
            InventoryProperty("Folding pins", .flag(true), origin: .suggested(.guess)),
        ]
    )

    /// The cables live next door, there are four of them and they carry the
    /// drift, which is more than a fixtures file can hold alongside everything
    /// else. The ones named through here are the ones something outside the
    /// cable set asks for by name; the rest arrive via `all`.
    internal static let cable = InventoryCableFixtures.cable
    internal static let shortCable = InventoryCableFixtures.shortCable
    internal static let lightningCable = InventoryCableFixtures.lightningCable

    internal static let all: [InventoryThing] =
        InventoryCableFixtures.all + [bulb, tape, box, sideboard, adapter]

    /// The two the comparison step puts side by side.
    internal static let cables: [InventoryThing] = InventoryCableFixtures.cables

    /// What somebody typed into the editor, and has not committed. Collides
    /// with `editing`'s "Cable length" under the normalisation rule, which is
    /// the whole reason it is spelled differently.
    internal static let draftKey = "cable-length"
    internal static let draftValue = "1.5"
    internal static let draftUnit = "m"

    /// The search the search step is showing the result of.
    internal static let query: [InventoryPropertyClause] = [
        InventoryPropertyClause(key: "End B", comparison: .equals, value: "USB-C"),
        InventoryPropertyClause(key: "Power", comparison: .atLeast, value: "30"),
    ]
}
