/// What the 2.4 update brings, and the three untyped items it covers.
///
/// Three rather than one: the tick list has to read as a list, and the third
/// entry, the tripod, is kept even though nothing else about it varies,
/// because a list of two invites a design that quietly assumes there is never
/// a third.
internal enum InventoryUntypedFixtures {
    internal static let bagType = InventoryItemType(
        name: "Bag", fieldNames: ["Material", "Closure", "Capacity", "How it is carried"],
        arrivedIn: "2.4")

    internal static let canvasBag = InventoryFoundationItem(
        id: "canvas-bag", name: "Unlabelled canvas bag", typeName: nil,
        placement: .direct(location: "Study"))

    internal static let sleepingBag = InventoryFoundationItem(
        id: "sleeping-bag", name: "Sleeping bag, two season", typeName: nil,
        placement: .direct(location: "Hall cupboard"))

    internal static let tripod = InventoryFoundationItem(
        id: "tripod", name: "Camera tripod", typeName: nil,
        placement: .direct(location: "Study"))

    internal static let matches: [InventoryFoundationItem] = [canvasBag, sleepingBag, tripod]
}
