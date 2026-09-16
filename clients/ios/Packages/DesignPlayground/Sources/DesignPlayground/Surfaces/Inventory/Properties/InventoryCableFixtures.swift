/// The cables.
///
/// Four of them, because the experiment's hardest questions are all about
/// several near-identical objects: whether they compare, whether a search
/// spans them, and what happens when two people record the same fact under
/// two different names. One cable answers none of that.
///
/// The drift is deliberate and it is two different problems. `powerCable`
/// spells a key the same way in a different case; `lightningCable` uses
/// another word for it altogether. A variant that settles the first has not
/// settled the second.
internal enum InventoryCableFixtures {
    internal static let cable = InventoryThing(
        id: "cable-2m",
        name: "USB-A to USB-C cable, 2 m",
        symbol: "cable.connector",
        location: "Office 04 · Study",
        category: "Cable",
        template: InventoryPropertyTemplates.cable,
        properties: [
            InventoryProperty("End A", .choice("USB-A")),
            InventoryProperty("End B", .choice("USB-C")),
            InventoryProperty("Data rate", .measure(0.48, unit: "Gbps")),
            InventoryProperty("Power", .measure(18, unit: "W")),
            InventoryProperty("Length", .measure(2, unit: "m")),
            InventoryProperty("Braided", .flag(false)),
            InventoryProperty("Bought with", .text("Old Kindle"), origin: .custom),
        ],
        tags: ["charges a phone", "slow data", "long"],
        notes: "The soft white one. Fine for charging overnight, useless for a drive.",
        suggestions: []
    )

    internal static let shortCable = InventoryThing(
        id: "cable-1m",
        name: "USB-A to USB-C cable, 1 m",
        symbol: "cable.connector",
        location: "Kitchen 12 · Kitchen",
        category: "Cable",
        template: InventoryPropertyTemplates.cable,
        properties: [
            InventoryProperty("End A", .choice("USB-A")),
            InventoryProperty("End B", .choice("USB-C")),
            InventoryProperty("Data rate", .measure(10, unit: "Gbps")),
            InventoryProperty("Power", .measure(60, unit: "W")),
            InventoryProperty("Length", .measure(1, unit: "m")),
            InventoryProperty("Braided", .flag(true)),
        ],
        tags: ["charges a laptop", "fast data", "short"],
        notes: "Black braided. The one to grab for a drive or a fast charge.",
        suggestions: []
    )

    /// A third and fourth cable, so "three others already record this" is a
    /// fact about the fixtures rather than a caption. They also carry the two
    /// kinds of drift a catalogue actually accumulates: the third spells the
    /// same key in lower case, and the fourth uses a different word for it
    /// entirely. One is a spelling to settle, the other is a rename to offer,
    /// and no variant can treat them the same way.
    internal static let powerCable = InventoryThing(
        id: "cable-usbc",
        name: "USB-C to USB-C cable, 2 m",
        symbol: "cable.connector",
        location: "Office 04 · Study",
        category: "Cable",
        template: InventoryPropertyTemplates.cable,
        properties: [
            InventoryProperty("End A", .choice("USB-C")),
            InventoryProperty("End B", .choice("USB-C")),
            InventoryProperty("Data rate", .measure(10, unit: "Gbps")),
            InventoryProperty("Power", .measure(100, unit: "W")),
            InventoryProperty("length", .measure(2, unit: "m")),
            InventoryProperty("Braided", .flag(true)),
        ],
        tags: ["charges a laptop", "fast data"],
        notes: "The one that came with the monitor.",
        suggestions: []
    )

    internal static let lightningCable = InventoryThing(
        id: "cable-lightning",
        name: "USB-A to Lightning cable, 1 m",
        symbol: "cable.connector",
        location: "Kitchen 12 · Kitchen",
        category: "Cable",
        template: InventoryPropertyTemplates.cable,
        properties: [
            InventoryProperty("End A", .choice("USB-A")),
            InventoryProperty("End B", .choice("Lightning")),
            InventoryProperty("Power", .measure(12, unit: "W")),
            InventoryProperty("Cable length", .measure(1, unit: "m"), origin: .custom),
        ],
        tags: ["old phone", "short"],
        notes: "Kept for the iPad that has not been replaced yet.",
        suggestions: []
    )

    internal static let all: [InventoryThing] = [cable, shortCable, powerCable, lightningCable]

    /// The two the comparison step puts side by side: same ends, different
    /// numbers, so the difference is the only thing to look at.
    internal static let cables: [InventoryThing] = [cable, shortCable]
}
