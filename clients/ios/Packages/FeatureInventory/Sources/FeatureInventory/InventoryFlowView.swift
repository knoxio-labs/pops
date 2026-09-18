import AppCore
import DesignSystem
import SwiftUI

/// The Inventory tab: its own navigation stack, the dashboard at the root,
/// and every screen the dashboard opens, as one view an embedder places
/// without knowing any of them exist.
///
/// It owns its `NavigationStack` for the reason `TransactionsFlowView` does:
/// the app's `TabView` hands a feature the whole tab, and a stack inside a
/// stack is broken. The path is `InventoryRoute`, this feature's own enum.
public struct InventoryFlowView: View {
    /// Held in `@State` so a parent re-rendering this view keeps the model
    /// and its observation rather than starting over with a new one.
    @State private var model: InventoryDashboardViewModel
    @State private var path: [InventoryRoute] = []
    private let store: any InventoryStore
    private let scanDiameter: CGFloat = 60

    /// Reads and writes through `dependencies.inventory`, and nothing else.
    public init(dependencies: AppDependencies) {
        store = dependencies.inventory
        _model = State(wrappedValue: InventoryDashboardViewModel(store: dependencies.inventory))
    }

    public var body: some View {
        NavigationStack(path: $path) {
            InventoryDashboardView(model: model)
                .navigationTitle(FeatureInventory.displayName)
                .inventoryTitleDisplay(large: true)
                .safeAreaInset(edge: .bottom, alignment: .trailing) {
                    if model.dashboard.map({ !$0.isFirstRun }) ?? false {
                        scanControl
                    }
                }
                .navigationDestination(for: InventoryRoute.self) { route in
                    InventoryDestinationView(route: route, store: store)
                }
        }
    }

    private var scanControl: some View {
        NavigationLink(value: InventoryRoute.scan) {
            Image(systemName: "barcode.viewfinder")
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
                .frame(width: scanDiameter, height: scanDiameter)
        }
        .inventoryGlass(in: Circle())
        .padding(.trailing, PopsSpacing.xl)
        .padding(.bottom, PopsSpacing.lg)
        .accessibilityLabel("Scan an item or container label")
    }
}
