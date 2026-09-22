import DesignSystem
import SwiftUI

/// Add, beside Scan at the foot of the dashboard: one icon button whose menu
/// names the three things Inventory can create.
///
/// Each entry opens what that thing is already created with — the shared item
/// form for an item and a container, the Locations screens' New place sheet
/// for a place — so there is no second way to create anything here.
///
/// Its own view rather than a member of `InventoryFlowView` because it reads
/// `\.inventoryItemForm`, and the flow view is where that presenter is
/// installed: a value installed on a view is not visible to that view's own
/// body, only to what it contains.
internal struct InventoryDashboardAddControl: View {
    internal let runner: InventoryCommandRunner
    internal let diameter: CGFloat
    @Environment(\.inventoryItemForm) private var itemForm
    @State private var creatingPlace = false

    internal var body: some View {
        Menu {
            Button("New item", systemImage: "cube") {
                itemForm?(.create(placement: nil))
            }
            // The same request as New item on purpose: an item becomes a
            // container by taking a container-capable type (POPS-4196), and
            // `InventoryItemFormRequest` carries no type to pre-select with.
            // The entry exists because the menu names what can be created,
            // not which form opens.
            Button("New container", systemImage: "shippingbox") {
                itemForm?(.create(placement: nil))
            }
            Button("New place", systemImage: "house") {
                creatingPlace = true
            }
        } label: {
            InventorySymbol.addNew.image
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
                .frame(width: diameter, height: diameter)
        }
        .popsGlass(in: Circle())
        .accessibilityLabel("Add")
        .inventoryLocationCreateSheet(isPresented: $creatingPlace, runner: runner)
    }
}
