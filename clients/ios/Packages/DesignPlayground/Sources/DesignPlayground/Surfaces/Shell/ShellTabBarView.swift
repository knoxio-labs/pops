import DesignSystem
import SwiftUI

/// The tab bar the app draws when the server offers `count` usable features.
///
/// A real `TabView`, built the way `ContentView.features` builds it — one tab
/// per feature, a `Label` from the same name and glyph, and no `selection`
/// binding. Drawing the bar by hand would defeat the point of reviewing it
/// here at all: in iOS 26 the bar is Liquid Glass, it floats, it reacts to the
/// content scrolling under it, and it owns the bottom safe area. None of that
/// survives an `HStack` with a background.
///
/// The tabs' *contents* are stand-ins, and only they are. What is under review
/// is the bar — which labels and glyphs a feature count produces, and how the
/// bar itself sits on the screen — so each tab holds a named placeholder
/// rather than a second copy of a flow that has its own surface already.
internal struct ShellTabBarView: View {
    internal let count: Int

    internal var body: some View {
        if count >= 2 {
            TabView {
                ForEach(shellTabs.prefix(count)) { tab in
                    placeholder(for: tab)
                        .tabItem { Label(tab.label, systemImage: tab.symbol) }
                        .tag(tab.id)
                }
            }
        } else {
            placeholder(for: shellTabs[0])
        }
    }

    private func placeholder(for tab: ShellTab) -> some View {
        EmptyStateView(message: "\(tab.label) fills the screen here. It has its own surface.")
    }
}
