import AppCore
import DesignSystem
import SwiftUI

/// Everything picked up and not put anywhere yet: the dashboard's In hand
/// section, full screen, with Put all back once there is more than one.
internal struct InventoryInHandView: View {
    @State private var model: InventoryInHandViewModel
    @State private var selection = InventorySelection()
    @State private var moving: InventoryMoveRequest?
    /// Bumped by Retry to restart the observation after the store ended it.
    @State private var generation = 0

    internal init(store: any InventoryStore) {
        _model = State(wrappedValue: InventoryInHandViewModel(store: store))
    }

    internal var body: some View {
        Group {
            switch model.phase {
            case .loading:
                InventoryInHandSkeleton()
            case .unavailable:
                ErrorStateView(message: InventoryCopy.unavailable) { generation += 1 }
                    .navigationTitle("In hand")
            case .loaded(let page):
                content(page)
            }
        }
        .task(id: generation) { await model.observe() }
    }

    private func content(_ page: InventoryInHandPage) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "In hand")
                if page.isOffline {
                    InventoryLocationNoticeLine(
                        symbol: InventorySymbol.offline.system, tint: .popsWarning,
                        text: "Offline. Changes wait on this phone.")
                }
                if page.items.isEmpty {
                    InventoryCentredLine(text: "Nothing in hand")
                } else {
                    InventoryInHandRows(
                        items: page.items, selection: $selection,
                        onPutBack: { item in Task { await model.putBack([item.id]) } },
                        onMove: { moving = InventoryMoveRequest(inHand: [$0]) },
                        loadPhoto: { await model.thumbnail($0) })
                }
            }
            .inventoryMotion(value: page.items.map(\.id))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .inventoryGroundedSwipeActionsContainer()
        .inventoryCollapsingTitle("In hand")
        .background(Color.popsBackground)
        .inHandChrome(page, model: model, selection: $selection, moving: $moving)
    }
}

extension View {
    fileprivate func inHandChrome(
        _ page: InventoryInHandPage, model: InventoryInHandViewModel,
        selection: Binding<InventorySelection>, moving: Binding<InventoryMoveRequest?>
    ) -> some View {
        toolbar {
            if !selection.wrappedValue.isSelecting, model.offersPutAllBack {
                ToolbarItem(placement: .inventoryBottomBar) {
                    Button("Put all back") { Task { await model.putAllBack() } }
                        .disabled(!model.canPutAllBack)
                }
            }
        }
        .tint(.popsInventory)
        .inventoryInHandSelectionBar(
            selection, items: page.items,
            onPutBack: { ids in Task { await model.putBack(ids) } },
            onMove: { moving.wrappedValue = $0 }
        )
        .inventoryMoveSheet(moving)
        .inventoryWriterFeedback(model.writer)
    }
}

/// The list before its rows arrive.
internal struct InventoryInHandSkeleton: View {
    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "In hand")
                InventoryLocationListSkeleton(rows: 5)
            }
            .padding(.horizontal, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .navigationTitle("In hand")
        .inventoryTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .principal) { Text("In hand").hidden() }
        }
        .accessibilityLabel("Loading")
    }
}
