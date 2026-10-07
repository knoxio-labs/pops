import DesignSystem
import FeatureEgo
import SwiftUI

/// The native shell tabs with the compact Ego launcher beside Search.
internal struct EgoEntryShellView: View {
    @State private var selection = shellTabs[0].id

    internal var body: some View {
        TabView(selection: $selection) {
            ForEach(shellTabs) { tab in
                Tab(tab.label, systemImage: tab.symbol, value: tab.id) {
                    placeholder(for: tab)
                }
            }
            Tab(value: "ego-launcher") {
                EmptyView()
            } label: {
                EgoLauncherTabLabel()
            }
            Tab("Search", systemImage: "magnifyingglass", value: "shell.search") {
                EmptyStateView(message: "Search is available from its own screen.")
            }
        }
    }

    private func placeholder(for tab: ShellTab) -> some View {
        EmptyStateView(message: "\(tab.label) fills the screen here. It has its own surface.")
    }
}
