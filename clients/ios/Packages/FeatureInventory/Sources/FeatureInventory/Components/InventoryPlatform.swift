import SwiftUI

extension View {
    /// Liquid Glass where the platform has it, and the nearest material where
    /// it does not.
    ///
    /// Platform conditionals live only in files named `*Platform.swift`, and
    /// those files hold nothing else: the package builds for macOS so
    /// `swift test` runs on the host, and `glassEffect` and the navigation
    /// title display mode do not exist there.
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

    /// The prominent glass button: the one call to action on a screen.
    @ViewBuilder
    internal func inventoryProminentGlassButton() -> some View {
        #if os(iOS)
            buttonStyle(.glassProminent)
        #else
            buttonStyle(.borderedProminent)
        #endif
    }

    /// The inset-grouped list style, which is iOS-only.
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
}

/// Several pieces of glass that belong to one control. iOS renders glass
/// that sits close together as one family only inside a container; without
/// one a row of buttons is a row of unrelated blobs.
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
