import SwiftUI

extension View {
    /// Places one item at the trailing edge of the navigation bar.
    @ViewBuilder
    public func popsTrailingBarItem<Item: View>(@ViewBuilder item: () -> Item) -> some View {
        #if os(iOS)
            toolbar { ToolbarItem(placement: .topBarTrailing, content: item) }
        #else
            toolbar { ToolbarItem(content: item) }
        #endif
    }

    /// Places secondary controls in the bottom toolbar.
    @ViewBuilder
    public func popsBottomBar<Items: View>(@ViewBuilder items: () -> Items) -> some View {
        #if os(iOS)
            toolbar { ToolbarItemGroup(placement: .bottomBar, content: items) }
        #else
            toolbar { ToolbarItemGroup(content: items) }
        #endif
    }
}
