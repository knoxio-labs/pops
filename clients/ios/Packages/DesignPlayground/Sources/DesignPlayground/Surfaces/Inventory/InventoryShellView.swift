import DesignSystem
import SwiftUI

internal struct InventoryShellView: View {
    internal let fixture: InventoryDashboardFixture
    /// Opens the shell on the search tab, staged as given.
    internal var search: InventorySearchStage?

    @State private var selected: Int

    private static let inventoryTab = 2
    private static let searchTab = 4
    private let scanDiameter: CGFloat = 60

    internal init(fixture: InventoryDashboardFixture, search: InventorySearchStage? = nil) {
        self.fixture = fixture
        self.search = search
        _selected = State(initialValue: search == nil ? Self.inventoryTab : Self.searchTab)
    }

    internal var body: some View {
        TabView(selection: $selected) {
            Tab("Transactions", systemImage: "list.bullet", value: 0) {
                otherTab("Transactions")
            }
            Tab("Purchases", systemImage: "cart", value: 1) {
                otherTab("Purchases")
            }
            Tab("Inventory", systemImage: "shippingbox", value: Self.inventoryTab) {
                inventory
            }
            Tab("Accounts", systemImage: "building.columns", value: 3) {
                otherTab("Accounts")
            }
            Tab(value: Self.searchTab, role: .search) {
                NavigationStack {
                    InventorySearchScreen(stage: searchStage)
                }
            }
        }
        .playgroundMinimizingTabBar()
    }

    private var searchStage: InventorySearchStage {
        if let search { return search }
        var stage = InventorySearchStage()
        if fixture.isFirstRun { stage.phase = .firstLaunch }
        return stage
    }

    private var inventory: some View {
        NavigationStack {
            InventoryGroundedDashboardView(fixture: fixture)
                .navigationTitle("Inventory")
                .playgroundTitleDisplay(large: true)
                .safeAreaInset(edge: .bottom, alignment: .trailing) {
                    if !fixture.isFirstRun {
                        scanControl
                    }
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
        .playgroundGlass(in: Circle())
        .padding(.trailing, PopsSpacing.xl)
        .padding(.bottom, PopsSpacing.lg)
        .accessibilityLabel("Scan an item or container label")
    }

    private func otherTab(_ name: String) -> some View {
        EmptyStateView(message: "\(name) fills the screen here. It has its own surface.")
    }
}
