import AppCore
import DesignSystem
import FeatureEgo
import SwiftUI

/// Places the Ego entry above the safe area when a tab switcher is not shown.
@MainActor
internal struct EgoEntryView: View {
    internal let isAvailable: Bool
    internal let onOpen: () -> Void

    internal var body: some View {
        if isAvailable {
            HStack {
                Spacer()
                button
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.xs)
        }
    }

    private var button: some View {
        Button(action: onOpen) {
            EgoLauncherIcon()
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open Ego")
        .accessibilityIdentifier("ego-entry")
    }
}

/// Keeps entity presentation on the chat while it is the active sheet host.
@MainActor
internal struct EgoSheetView: View {
    internal let dependencies: AppDependencies
    internal let context: @MainActor () -> EgoAppContext?
    internal let presentation: EntityPresentation
    internal let entityRouter: any EntityRouter
    internal let onClose: @MainActor () -> Void

    internal var body: some View {
        EgoFlowView(
            dependencies: dependencies,
            context: context,
            entityRouter: entityRouter,
            onClose: onClose
        )
        .modifier(
            EntitySheets(
                presentation: presentation,
                dependencies: dependencies,
                entityRouter: entityRouter,
                isActive: true
            )
        )
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .presentationBackground(Color.popsBackground)
    }
}
