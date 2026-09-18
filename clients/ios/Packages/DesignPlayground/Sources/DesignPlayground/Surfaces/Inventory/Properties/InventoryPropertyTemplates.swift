/// The templates the fixtures are drawn against.
///
/// Six of them, chosen because they break in different places: a cable has two
/// ends and a rating, a bulb has a fitting and a protocol, a box has a load
/// limit, and a sideboard has nothing worth a field at all. A set of templates
/// that all looked like the cable would make every variant look fine.
internal enum InventoryPropertyTemplates {
    internal static let cable = InventoryTemplate(
        id: "cable",
        name: "Cable",
        fields: [
            InventoryTemplateField(
                "End A", "Choice", hint: "The connector at one end", highlighted: true),
            InventoryTemplateField("End B", "Choice", highlighted: true),
            InventoryTemplateField("Data rate", "Measurement", unit: "Gbps"),
            InventoryTemplateField("Power", "Measurement", unit: "W", hint: "What it can carry"),
            InventoryTemplateField("Length", "Measurement", unit: "m", highlighted: true),
            InventoryTemplateField("Braided", "Yes or no"),
        ]
    )

    internal static let charger = InventoryTemplate(
        id: "charger",
        name: "Charger",
        fields: [
            InventoryTemplateField(
                "Ports", "Text", hint: "Each port and what it does", highlighted: true),
            InventoryTemplateField("Power", "Measurement", unit: "W", highlighted: true),
            InventoryTemplateField("Folding pins", "Yes or no"),
            InventoryTemplateField("Plug", "Choice"),
        ]
    )

    internal static let bulb = InventoryTemplate(
        id: "bulb",
        name: "Light bulb",
        fields: [
            InventoryTemplateField(
                "Fitting", "Choice", hint: "E27, GU10, B22",
                choices: ["E27", "GU10", "B22"], highlighted: true),
            InventoryTemplateField("Protocol", "Choice", highlighted: true),
            InventoryTemplateField("Brightness", "Measurement", unit: "lm"),
            InventoryTemplateField("Colour temperature", "Range", unit: "K"),
            InventoryTemplateField("Dimmable", "Yes or no"),
        ]
    )

    internal static let tape = InventoryTemplate(
        id: "tape",
        name: "Tape",
        fields: [
            InventoryTemplateField("Use", "Choice", hint: "What it is for, not what it is made of"),
            InventoryTemplateField("Width", "Measurement", unit: "mm", highlighted: true),
            InventoryTemplateField("Length", "Measurement", unit: "m", highlighted: true),
            InventoryTemplateField("Leaves residue", "Yes or no"),
        ]
    )

    internal static let container = InventoryTemplate(
        id: "container",
        name: "Storage box",
        fields: [
            InventoryTemplateField("Capacity", "Measurement", unit: "L", highlighted: true),
            InventoryTemplateField("Load limit", "Measurement", unit: "kg", highlighted: true),
            InventoryTemplateField("Footprint", "Text", hint: "Outside, in millimetres"),
            InventoryTemplateField("Stackable", "Yes or no"),
        ]
    )

    /// The template offered when a reviewer changes a sideboard's mind about
    /// what it is. Deliberately thin: furniture's useful facts are its
    /// dimensions and where it stands, and a template that asked for eight
    /// more would be a form nobody finishes.
    internal static let furniture = InventoryTemplate(
        id: "furniture",
        name: "Furniture",
        fields: [
            InventoryTemplateField(
                "Footprint", "Text", hint: "Width × depth × height", highlighted: true),
            InventoryTemplateField(
                "Material", "Choice",
                choices: [
                    "Oak", "Pine", "Walnut", "Ash", "Beech", "MDF", "Plywood", "Veneer",
                    "Rattan", "Metal", "Glass", "Painted wood",
                ], highlighted: true),
            InventoryTemplateField("Needs two people", "Yes or no"),
        ]
    )

    internal static let all: [InventoryTemplate] = [
        cable, charger, bulb, tape, container, furniture,
    ]
}
