import DesignSystem
import SwiftUI

/// First launch, before anything has been downloaded: one neutral line and
/// the download.
internal struct InventoryFirstLaunchPrompt: View {
    internal let download: () -> Void

    internal var body: some View {
        VStack(spacing: PopsSpacing.lg) {
            InventoryCentredLine(text: "Nothing on this phone yet")
            InventoryDashedActionButton(
                title: "Download", symbol: InventorySymbol.update.system, action: download)
        }
        .inventoryFadeIn()
    }
}
