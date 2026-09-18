/// Recording an item, and correcting one.
///
/// One surface, because it is one screen: New item and Edit item differ by a
/// title and by what the button says, and staging them apart would invite the
/// two to drift the way eleven parallel screens already did once.
@MainActor
internal enum InventoryCreationSurfaces {
    internal static let surfaces: [DesignSurface] = [create]

    internal static let createID = SurfaceID(area: "inventory", slug: "item-create")

    internal static let create = create(opening: "blank")

    /// The form opening on `state`, for an experiment whose answer is shown
    /// there.
    internal static func create(opening state: String) -> DesignSurface {
        let all = InventoryItemFormCase.all.map { entry in
            DesignState(entry.id, entry.title) { entry.view }
        }
        return DesignSurface(
            id: createID,
            title: "New item / Edit item",
            synopsis:
                "The camera first, then one system form. Only a name is required; the record exists "
                + "at the final action and everything above it is held on this phone until then.",
            chrome: .sheet,
            sheetDetents: .large,
            states: all.filter { $0.id == state } + all.filter { $0.id != state }
        )
    }
}
