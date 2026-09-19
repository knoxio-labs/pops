import FeatureInventory
import Observation

/// Which record a routed `pops://` reference asked to open, held until the
/// paired shell presents it.
///
/// Set by the handlers `AppComposition` registers with its `EntityRouter`,
/// and read by `ContentView`, which presents it over whichever tab is showing:
/// a label names a record, not a tab, so where the person happened to be
/// should not decide whether it opens.
@MainActor
@Observable
internal final class EntityPresentation {
    /// The Inventory record to present, or nil when none is open.
    internal var inventory: InventoryEntity?
}
