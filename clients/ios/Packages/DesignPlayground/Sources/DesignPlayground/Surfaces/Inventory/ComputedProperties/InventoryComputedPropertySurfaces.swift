@MainActor
internal enum InventoryComputedPropertySurfaces {
    private static let typeID = SurfaceID(area: "inventory", slug: "item-type-computed-property")
    private static let formID = SurfaceID(area: "inventory", slug: "item-form-computed-property")
    private static let detailID = SurfaceID(
        area: "inventory", slug: "item-detail-computed-property")

    internal static let typeDefinition = DesignSurface(
        id: typeID,
        title: "Item type · Computed property",
        synopsis:
            "A Storage box defines Capacity from its three dimensions and allows a saved item to override the result.",
        chrome: .navigation,
        states: [
            DesignState("properties", "Property list") {
                InventoryTypeDefinitionView(stage: .fields)
            },
            DesignState("formula", "Calculation editor") {
                InventoryTypeDefinitionView(stage: .calculation)
            },
        ]
    )

    internal static let itemForm = DesignSurface(
        id: formID,
        title: "Item form · Computed property",
        synopsis:
            "Capacity calculates only on request, remains editable, and is stored as an ordinary "
            + "value when the item is saved.",
        chrome: .navigation,
        states: [
            DesignState("calculated", "Calculated value") {
                InventoryComputedPropertyItemForm(openingState: .calculated)
            },
            DesignState("overridden", "Manual override") {
                InventoryComputedPropertyItemForm(openingState: .overridden)
            },
            DesignState("missing-input", "Missing input") {
                InventoryComputedPropertyItemForm(openingState: .unavailable)
            },
        ]
    )

    internal static let itemDetail = DesignSurface(
        id: detailID,
        title: "Item detail · Computed property",
        synopsis:
            "The saved Capacity reads like every other property; no live formula remains after save.",
        chrome: .navigation,
        states: [DesignState.standard { InventoryComputedPropertyItemDetail() }]
    )

    internal static let surfaces = [typeDefinition, itemForm, itemDetail]
}
