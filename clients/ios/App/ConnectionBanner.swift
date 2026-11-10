import AppCore
import DesignSystem
import SwiftUI

internal struct ConnectionBanner: View {
    internal let phase: BootstrapPhase

    @State private var visibility = DegradedBannerVisibility()

    internal var body: some View {
        Group {
            if visibility.isVisible(for: phase) {
                PopsCard {
                    HStack(alignment: .top, spacing: PopsSpacing.md) {
                        Text(RootCopy.degraded)
                            .font(.popsBody)
                            .foregroundStyle(Color.popsMutedForeground)
                        Spacer(minLength: PopsSpacing.sm)
                        Button {
                            visibility.dismiss(phase)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.popsBody)
                                .foregroundStyle(Color.popsMutedForeground)
                        }
                        .accessibilityLabel(RootCopy.dismissDegraded)
                    }
                }
                .padding([.horizontal, .top], PopsSpacing.lg)
            }
        }
        .onChange(of: phase) { _, phase in
            if !phase.isDegraded { visibility.reset() }
        }
    }
}
