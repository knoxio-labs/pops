import SwiftUI

extension EnvironmentValues {
    /// Whether Inventory's replica could not be opened for the currently
    /// bound device, so every write already goes to `StorageFullInventoryStore`
    /// before anything has been attempted.
    ///
    /// The composition root sets this once per binding; a screen reads it to
    /// announce the interruption the moment Inventory is entered, rather than
    /// waiting for a write nobody has made yet to discover the same thing.
    /// `false` until the composition root says otherwise, which is correct
    /// for a preview or a test that never sets it: nothing here should
    /// announce a fault it was never told about.
    @Entry public var inventoryStorageFullOnEntry = false
}
