import AppCore
import DesignSystem
import FeatureEgo
import SwiftUI

/// Places the Ego entry in the tab accessory or above the safe area.
@MainActor
internal struct EgoEntryView: View {
    internal enum Placement {
        case tabAccessory
        case safeArea
    }

    internal let isAvailable: Bool
    internal let placement: Placement
    internal let onOpen: () -> Void

    internal var body: some View {
        if isAvailable {
            switch placement {
            case .tabAccessory:
                button
            case .safeArea:
                HStack {
                    Spacer()
                    button
                }
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.vertical, PopsSpacing.xs)
                .background(Color.popsBackground)
            }
        }
    }

    private var button: some View {
        Button(action: onOpen) {
            Image(systemName: FeatureEgo.symbolName)
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
        .presentationDetents([.medium, .large])
    }
}
