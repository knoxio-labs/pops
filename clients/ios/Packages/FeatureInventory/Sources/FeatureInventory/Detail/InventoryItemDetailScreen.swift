import AppCore
import DesignSystem
import SwiftUI

/// What `InventoryRoute.item` opens: Item detail over the store, with its
/// skeleton until the first answer, and a plain explanation when the item is
/// gone or the store never answers.
internal struct InventoryItemDetailScreen: View {
    /// Held in `@State` so a parent re-rendering this view keeps the model
    /// and its observation rather than starting over.
    @State private var model: InventoryItemDetailViewModel

    internal init(itemId: InventoryItem.ID, store: any InventoryStore) {
        _model = State(wrappedValue: InventoryItemDetailViewModel(itemId: itemId, store: store))
    }

    internal var body: some View {
        content
            .task { await model.observe() }
            .inventoryDetailFailureAlert(model)
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading:
            InventoryItemDetailSkeleton()
        case .loaded(let detail):
            InventoryItemDetailView(detail: detail, model: model)
        case .missing:
            InventoryPendingScreen(
                title: "Item", detail: "This item is no longer in your inventory.",
                symbol: InventorySymbol.item.system)
        case .unavailable:
            InventoryPendingScreen(
                title: "Item", detail: InventoryCopy.unavailable,
                symbol: InventorySymbol.stale.system)
        }
    }
}

extension View {
    /// What Item detail shows when one of its own writes did not land, on
    /// any screen that draws the item page over `model`.
    internal func inventoryDetailFailureAlert(_ model: InventoryItemDetailViewModel) -> some View {
        inventoryWriteFailureAlerts(Bindable(model).failure)
    }
}

/// The page before its record has arrived: the same blocks, at the same
/// sizes, with nothing in them, so the layout does not jump when the answer
/// lands.
internal struct InventoryItemDetailSkeleton: View {
    @ScaledMetric(relativeTo: .largeTitle) private var heroHeight = PopsSize.pageHeight * 1.5
    @ScaledMetric(relativeTo: .body) private var line = PopsSpacing.lg
    @ScaledMetric(relativeTo: .body) private var control = PopsSize.touchTarget

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            blocks
                .popsShimmer()
            Spacer(minLength: PopsSpacing.zero)
        }
        .background(Color.popsBackground)
        .ignoresSafeArea(edges: .top)
        .navigationTitle("")
        .popsTitleDisplay(large: false)
        .accessibilityLabel("Loading")
    }

    private var blocks: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Color.popsSurface
                .frame(height: heroHeight)
                .frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                bar(widthFraction: 0.7)
                bar(widthFraction: 0.4)
                bar(widthFraction: 0.55)
            }
            .padding(.horizontal, PopsSpacing.lg)
            HStack(spacing: PopsSpacing.lg) {
                ForEach(0..<3, id: \.self) { _ in
                    Circle().fill(Color.popsSurface)
                        .frame(width: control, height: control)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
        }
    }

    private func bar(widthFraction: CGFloat) -> some View {
        GeometryReader { proxy in
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .fill(Color.popsSurface)
                .frame(width: proxy.size.width * widthFraction)
        }
        .frame(height: line)
    }
}
