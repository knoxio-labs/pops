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
            InventoryTemplateField("End A", "Choice", hint: "The connector at one end"),
            InventoryTemplateField("End B", "Choice"),
            InventoryTemplateField("Data rate", "Measurement", unit: "Gbps"),
            InventoryTemplateField("Power", "Measurement", unit: "W", hint: "What it can carry"),
            InventoryTemplateField("Length", "Measurement", unit: "m"),
            InventoryTemplateField("Braided", "Yes or no"),
        ]
    )

    internal static let charger = InventoryTemplate(
        id: "charger",
        name: "Charger",
        fields: [
            InventoryTemplateField("Ports", "Text", hint: "Each port and what it does"),
            InventoryTemplateField("Power", "Measurement", unit: "W"),
            InventoryTemplateField("Folding pins", "Yes or no"),
            InventoryTemplateField("Plug", "Choice"),
        ]
    )

    internal static let bulb = InventoryTemplate(
        id: "bulb",
        name: "Light bulb",
        fields: [
            InventoryTemplateField("Fitting", "Choice", hint: "E27, GU10, B22"),
            InventoryTemplateField("Protocol", "Choice"),
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
            InventoryTemplateField("Width", "Measurement", unit: "mm"),
            InventoryTemplateField("Length", "Measurement", unit: "m"),
            InventoryTemplateField("Leaves residue", "Yes or no"),
        ]
    )

    internal static let container = InventoryTemplate(
        id: "container",
        name: "Storage box",
        fields: [
            InventoryTemplateField("Capacity", "Measurement", unit: "L"),
            InventoryTemplateField("Load limit", "Measurement", unit: "kg"),
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
            InventoryTemplateField("Footprint", "Text", hint: "Width × depth × height"),
            InventoryTemplateField("Material", "Choice"),
            InventoryTemplateField("Needs two people", "Yes or no"),
        ]
    )

    internal static let all: [InventoryTemplate] = [
        cable, charger, bulb, tape, container, furniture,
    ]
}
