import DesignSystem
import SwiftUI

/// A browser's large title drawn in its scroll view, with room for a control
/// beside it.
///
/// The bar's large-title slot clips anything taller than the title's text, so
/// a page that wants a pill on the title's row draws the row itself and pairs
/// it with `inventoryCollapsingTitle(_:)`.
internal struct InventoryPageTitle<Trailing: View>: View {
    internal let title: String
    @ViewBuilder internal let trailing: () -> Trailing

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Text(title)
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: PopsSpacing.sm)
            trailing()
        }
    }
}

extension InventoryPageTitle where Trailing == EmptyView {
    internal init(title: String) {
        self.init(title: title) { EmptyView() }
    }
}

extension View {
    /// The inline title for a page that draws its own large one: hidden until
    /// the drawn title has scrolled under the bar, as a large title collapses.
    internal func inventoryCollapsingTitle(_ title: String) -> some View {
        modifier(InventoryCollapsingTitle(title: title))
    }
}

private struct InventoryCollapsingTitle: ViewModifier {
    let title: String
    @State private var scrolledAway = false

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentOffset.y + geometry.contentInsets.top > PopsSpacing.xxl
            } action: { _, isAway in
                scrolledAway = isAway
            }
            .navigationTitle(title)
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(title)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                        .opacity(scrolledAway ? 1 : 0)
                        .inventoryMotion(value: scrolledAway)
                        .accessibilityHidden(!scrolledAway)
                }
            }
    }
}
