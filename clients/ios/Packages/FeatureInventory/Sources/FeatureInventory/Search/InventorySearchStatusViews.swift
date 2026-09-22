import DesignSystem
import SwiftUI

/// First launch, before anything has been downloaded: one neutral line and
/// the download.
internal struct InventoryFirstLaunchPrompt: View {
    internal let download: () -> Void

    internal var body: some View {
        VStack(spacing: PopsSpacing.lg) {
            PopsCentredLine(text: "Nothing on this phone yet")
            PopsDashedActionButton(
                title: "Download", symbol: InventorySymbol.update.system,
                tint: .popsInventory, action: download)
        }
        .popsFadeIn()
    }
}
