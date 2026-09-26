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
    private let suggester: InventoryCodeSuggester
    private let scan: InventoryScanPrefill
    private let entityRouter: any EntityRouter
    private let scanDiameter: CGFloat = 60

    /// Reads and writes through `dependencies.inventory`, and nothing else.
    /// `entityRouter` is the composition root's one instance, the same the
    /// `pops` URL scheme resolves through — passed in rather than read from
    /// `dependencies` because it is not bound per paired device, unlike
    /// everything else there.
    public init(dependencies: AppDependencies, entityRouter: any EntityRouter) {
        store = dependencies.inventory
        suggester = InventoryCodeSuggester { name, typeKey, stem in
            try await dependencies.codeSuggestions.suggestCodes(
                name: name, typeKey: typeKey, stem: stem)
        }
        self.entityRouter = entityRouter
        scan = .system(lookup: dependencies.barcodeLookup)
        _model = State(wrappedValue: InventoryDashboardViewModel(store: dependencies.inventory))
    }

    public var body: some View {
        NavigationStack(path: $path) {
            InventoryDashboardView(model: model)
                .navigationTitle(FeatureInventory.displayName)
                .popsTitleDisplay(large: true)
                .safeAreaInset(edge: .bottom, alignment: .trailing) {
                    if model.dashboard.map({ !$0.isFirstRun }) ?? false {
                        controls
                    }
                }
                .navigationDestination(for: InventoryRoute.self) { route in
                    InventoryDestinationView(route: route, store: store, entityRouter: entityRouter)
                }
        }
        .inventoryItemFormPresentation(store: store, suggester: suggester, scan: scan)
        .inventorySyncInterruptions(store: store)
        .inventoryAnnouncesStorageFullOnEntry()
    }

    /// Add and Scan, side by side at the foot of the dashboard. Scan carries
    /// the amber: it is the screen's call to action, and one tint per screen
    /// means Add stays the neutral glass beside it.
    private var controls: some View {
        HStack(spacing: PopsSpacing.md) {
            InventoryDashboardAddControl(runner: model.runner, diameter: scanDiameter)
            scanControl
        }
        .padding(.trailing, PopsSpacing.xl)
        .padding(.bottom, PopsSpacing.lg)
    }

    private var scanControl: some View {
        NavigationLink(value: InventoryRoute.scan) {
            Image(systemName: "barcode.viewfinder")
                .font(.popsTitle)
                .foregroundStyle(Color.popsInventory)
                .frame(width: scanDiameter, height: scanDiameter)
        }
        .popsGlass(in: Circle())
        .accessibilityLabel("Scan an item or container label")
    }
}
