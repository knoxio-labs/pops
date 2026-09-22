import SwiftUI

extension View {
    /// The platform's glass button: every verb that is not the screen's one
    /// call to action.
    @ViewBuilder
    internal func inventoryGlassButton() -> some View {
        #if os(iOS)
            buttonStyle(.glass)
        #else
            buttonStyle(.bordered)
        #endif
    }

    /// The inset-grouped list style, which is iOS-only; on the host
    /// toolchain the platform's own default stands in.
    @ViewBuilder
    internal func inventoryInsetGroupedList() -> some View {
        #if os(iOS)
            listStyle(.insetGrouped)
        #else
            self
        #endif
    }

    /// `searchable` with an explicit presentation binding, which is iOS-only.
    @ViewBuilder
    internal func inventorySearchable(
        text: Binding<String>, isPresented: Binding<Bool>, prompt: String
    ) -> some View {
        #if os(iOS)
            searchable(text: text, isPresented: isPresented, prompt: prompt)
        #else
            searchable(text: text, prompt: prompt)
        #endif
    }

    /// A leading navigation bar item; `topBarLeading` is iOS-only.
    @ViewBuilder
    internal func inventoryLeadingBarItem<Item: View>(@ViewBuilder item: () -> Item) -> some View {
        #if os(iOS)
            toolbar { ToolbarItem(placement: .topBarLeading, content: item) }
        #else
            toolbar { ToolbarItem(content: item) }
        #endif
    }

    /// A trailing navigation bar item; `topBarTrailing` is iOS-only.
    @ViewBuilder
    internal func inventoryTrailingBarItem<Item: View>(@ViewBuilder item: () -> Item)
        -> some View
    {
        #if os(iOS)
            toolbar { ToolbarItem(placement: .topBarTrailing, content: item) }
        #else
            toolbar { ToolbarItem(content: item) }
        #endif
    }

    /// Hides the tab bar while `hidden`, so a bottom bar can take its place.
    /// Only iOS has one.
    @ViewBuilder
    internal func inventoryHidesTabBar(_ hidden: Bool) -> some View {
        #if os(iOS)
            toolbar(hidden ? .hidden : .automatic, for: .tabBar)
        #else
            self
        #endif
    }

    /// Hides the navigation bar and its back button, for a screen that draws
    /// its own close control — the scanner's full-bleed camera. `toolbar(for:
    /// .navigationBar)` and `navigationBarBackButtonHidden` are both iOS-only.
    @ViewBuilder
    internal func inventoryHidesNavigationBar() -> some View {
        #if os(iOS)
            toolbar(.hidden, for: .navigationBar)
                .navigationBarBackButtonHidden(true)
        #else
            self
        #endif
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

extension ToolbarContent {
    /// Drops the bar's shared glass behind an item that draws its own capsule.
    /// Only iOS has the shared bottom-bar background.
    @ToolbarContentBuilder
    internal func inventoryOwnBackground() -> some ToolbarContent {
        #if os(iOS)
            sharedBackgroundVisibility(.hidden)
        #else
            self
        #endif
    }
}
