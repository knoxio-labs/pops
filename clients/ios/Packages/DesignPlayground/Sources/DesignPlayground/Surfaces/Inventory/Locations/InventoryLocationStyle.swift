/// The knobs POPS-3985's open experiments turn, held together the way
/// ``InventoryFoundationStyle`` holds POPS-3979's: one experiment per field,
/// the others left at whatever a variant did not choose to vary.
internal struct InventoryLocationStyle: Equatable {
    /// Tree-first versus search/list-first phone navigation.
    internal enum Navigation: Equatable { case treeFirst, searchFirst }
    /// Inline hierarchy disclosure versus drill-down navigation.
    internal enum Disclosure: Equatable { case inline, drillDown }
    /// One universal picker versus a task-specific compact destination picker.
    internal enum Picker: Equatable { case universal, compact }
    /// How direct and effective placement differ visually on a location's
    /// detail: apart in their own section, together with a marker on the
    /// effective-only rows, or hidden behind a toggle.
    internal enum PlacementVisual: Equatable { case separateSection, inlineMarker, toggle }

    internal var navigation: Navigation
    internal var disclosure: Disclosure
    internal var picker: Picker
    internal var placementVisual: PlacementVisual

    internal init(
        navigation: Navigation = .treeFirst,
        disclosure: Disclosure = .drillDown,
        picker: Picker = .compact,
        placementVisual: PlacementVisual = .separateSection
    ) {
        self.navigation = navigation
        self.disclosure = disclosure
        self.picker = picker
        self.placementVisual = placementVisual
    }
}
