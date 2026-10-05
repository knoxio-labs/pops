import DesignSystem
import SwiftUI

/// The real shell tabs with the Ego entry control attached to the tab bar.
internal struct EgoEntryShellView: View {
    internal var body: some View {
        #if os(iOS)
            shell.tabViewBottomAccessory {
                entryControl
            }
        #else
            shell
        #endif
    }

    private var shell: some View {
        TabView {
            ForEach(shellTabs) { tab in
                EmptyStateView(
                    message: "\(tab.label) fills the screen here. It has its own surface."
                )
                .tabItem { Label(tab.label, systemImage: tab.symbol) }
                .tag(tab.id)
            }
        }
    }

    private var entryControl: some View {
        Button {
        } label: {
            Image(systemName: "bubble.left")
                .font(.popsTitle)
                .foregroundStyle(Color.popsAccent)
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ego")
        .accessibilityIdentifier("ego-entry")
    }
}
