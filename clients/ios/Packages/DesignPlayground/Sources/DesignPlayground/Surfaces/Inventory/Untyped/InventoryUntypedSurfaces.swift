/// The one surface POPS-4016 still has open work on: a type arriving for
/// items already waiting. Everything else it raised is decided, and reuses
/// the approved Items and New item surfaces rather than a surface of its own.
internal enum InventoryUntypedSurfaces {
    internal static let typeArrivedID = SurfaceID(area: "inventory", slug: "type-arrived")

    @MainActor internal static let typeArrived = DesignSurface(
        id: typeArrivedID,
        title: "A type arrives",
        synopsis:
            "The phone asks once, over the dashboard, when a shipped type covers items already "
            + "waiting.",
        chrome: .bare,
        states: InventoryTypeArrivedState.allCases.map { state in
            DesignState(state.id, state.title) { InventoryTypeArrivedView(state: state) }
        }
    )

    @MainActor internal static let surfaces: [DesignSurface] = [typeArrived]
}
