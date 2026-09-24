import SwiftUI

/// A repaired change's values the current fields no longer take, struck
/// through with why, so nothing the person entered goes unaccounted for.
/// Draws nothing when every value was carried over.
internal struct InventoryFormNotCarriedSection: View {
    internal let values: [InventoryQueuedValue]

    internal var body: some View {
        if !values.isEmpty {
            Section {
                ForEach(values) { value in
                    InventoryQueuedValueRow(value: value)
                }
            } header: {
                Text("Not carried over")
            } footer: {
                Text("These values no longer fit this item's fields, so saving leaves them out.")
            }
        }
    }
}
