import SwiftUI

extension View {
    /// Liquid Glass where the platform has it, and the nearest material where
    /// it does not.
    ///
    /// This file holds every platform conditional in the package, and holds
    /// them alone: the package builds for macOS so `swift test` runs on the
    /// host, and `glassEffect` and the navigation title display mode do not
    /// exist there.
    @ViewBuilder
    internal func inventoryGlass(in shape: some Shape) -> some View {
        #if os(iOS)
            glassEffect(.regular, in: shape)
        #else
            background(.regularMaterial, in: shape)
        #endif
    }

    /// Sets the navigation title's display mode, which is an iOS-only
    /// modifier.
    @ViewBuilder
    internal func inventoryTitleDisplay(large: Bool) -> some View {
        #if os(iOS)
            navigationBarTitleDisplayMode(large ? .large : .inline)
        #else
            self
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

    /// The inset-grouped list style, which is iOS-only; on the host toolchain
    /// the platform's own default stands in.
    @ViewBuilder
    internal func inventoryInsetGroupedList() -> some View {
        #if os(iOS)
            listStyle(.insetGrouped)
        #else
            self
        #endif
    }

    /// The one call to action on a sheet, in the platform's prominent glass
    /// button style.
    @ViewBuilder
    internal func inventoryProminentGlassButton() -> some View {
        #if os(iOS)
            buttonStyle(.glassProminent)
        #else
            buttonStyle(.borderedProminent)
        #endif
    }

    /// A leading item in the navigation bar; `topBarLeading` is iOS-only.
    @ViewBuilder
    internal func inventoryLeadingBarItem<Item: View>(@ViewBuilder item: () -> Item) -> some View {
        #if os(iOS)
            toolbar { ToolbarItem(placement: .topBarLeading, content: item) }
        #else
            toolbar { ToolbarItem(content: item) }
        #endif
    }

    /// A trailing item in the navigation bar; `topBarTrailing` is iOS-only.
    @ViewBuilder
    internal func inventoryTrailingBarItem<Item: View>(@ViewBuilder item: () -> Item) -> some View
    {
        #if os(iOS)
            toolbar { ToolbarItem(placement: .topBarTrailing, content: item) }
        #else
            toolbar { ToolbarItem(content: item) }
        #endif
    }
}

/// Several pieces of glass that belong to one control, merged as a family
/// where the platform has glass.
internal struct InventoryGlassGroup<Content: View>: View {
    internal let spacing: CGFloat
    @ViewBuilder internal let content: Content

    internal var body: some View {
        #if os(iOS)
            GlassEffectContainer(spacing: spacing) { content }
        #else
            content
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
