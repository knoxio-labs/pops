import DesignSystem
import SwiftUI

/// An approved screen with the app's own degradation banner above it.
/// Inventory draws no sync status of its own; the banner and each row's mark
/// are the whole of it.
///
/// The banner is the shell's own ``ShellDegradationBanner``, because
/// `ShellContentView` draws it only over Purchases. Stacked rather than inset:
/// a top inset over a navigation stack left the stack's own title underneath
/// the card.
internal struct InventoryOfflineStage<Content: View>: View {
    private let content: Content

    internal init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    internal var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            ShellDegradationBanner()
            content
        }
        .background(Color.popsBackground)
    }
}
