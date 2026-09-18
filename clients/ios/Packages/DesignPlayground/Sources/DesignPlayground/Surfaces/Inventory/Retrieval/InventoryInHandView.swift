import DesignSystem
import SwiftUI

/// What a staged In hand list does on arrival, so a reviewer lands on the
/// moment after an action rather than before it.
internal enum InventoryInHandStage: Equatable {
    case putBack(String)
    case move(String)
}

/// Everything picked up and not put anywhere yet: the dashboard's In hand
/// section, full screen. Nothing asks first; Undo is how a mistake is fixed.
internal struct InventoryInHandView: View {
    internal let offline: String?
    private let stage: InventoryInHandStage?
    @State private var list: InventoryInHandList
    @State private var moving: InventoryInHandMoveRequest?
    @State private var offer: InventoryUndoOffer?
    @State private var selection: InventorySelection

    internal init(
        items: [InventoryRetrievalItem],
        offline: String? = nil,
        stage: InventoryInHandStage? = nil,
        selected: Set<String> = []
    ) {
        self.offline = offline
        self.stage = stage
        _list = State(initialValue: InventoryInHandList(items))
        _selection = State(initialValue: InventorySelection(selected))
        if case .move(let id) = stage, let retrieval = items.first(where: { $0.id == id }) {
            _moving = State(initialValue: InventoryInHandMoveRequest(retrieval))
        }
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryPageTitle(title: "In hand")
                if let offline {
                    InventoryLocationNoticeLine(
                        symbol: InventorySymbol.offline.system, tint: .popsWarning, text: offline)
                }
                if list.isEmpty {
                    InventoryCentredLine(text: "Nothing in hand")
                } else {
                    InventoryInHandRows(
                        items: list.items, selection: $selection, onPutBack: putBack,
                        onMove: { moving = InventoryInHandMoveRequest($0) })
                }
            }
            .inventoryMotion(value: list.items.map(\.id))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .inventoryGroundedSwipeActionsContainer()
        .inventoryCollapsingTitle("In hand")
        .background(Color.popsBackground)
        .toolbar {
            if !selection.isSelecting, InventoryInHand.offersPutAllBack(list.items) {
                ToolbarItem(placement: .inventoryBottomBar) {
                    Button("Put all back") { putBack(Set(list.items.map(\.id))) }
                        .disabled(!list.items.contains(where: InventoryRetrieval.canPutBack))
                }
            }
        }
        .tint(.popsInventory)
        .inventoryInHandSelectionBar(
            $selection, list: list, onPutBack: putBack, onMove: { moving = $0 }
        )
        .inventoryInHandActions($list, moving: $moving, offer: $offer, lingers: stage != nil)
        .task { await playStage() }
    }

    private func putBack(_ ids: Set<String>) {
        if let next = list.putBack(ids) { offer = next }
    }

    private func playStage() async {
        guard case .putBack(let id) = stage else { return }
        try? await Task.sleep(for: InventoryMotion.stagedBeat)
        putBack([id])
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
        .playgroundTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .principal) { Text("In hand").hidden() }
        }
        .accessibilityLabel("Loading")
    }
}

extension ToolbarItemPlacement {
    /// The bottom bar, which only iOS has.
    internal static var inventoryBottomBar: ToolbarItemPlacement {
        #if os(iOS)
            .bottomBar
        #else
            .automatic
        #endif
    }
}
