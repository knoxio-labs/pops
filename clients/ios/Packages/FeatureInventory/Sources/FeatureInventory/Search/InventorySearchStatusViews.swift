import DesignSystem
import SwiftUI

/// First launch, before anything has been downloaded: one neutral line and
/// the download.
public struct InventoryNotOnPhonePrompt: View {
    private let download: () -> Void

    /// Creates the first-download prompt with its download action.
    public init(download: @escaping () -> Void) {
        self.download = download
    }

    public var body: some View {
        VStack(spacing: PopsSpacing.lg) {
            PopsCentredLine(text: "Inventory isn't on this phone yet")
            PopsDashedActionButton(
                title: "Download", symbol: InventorySymbol.update.system,
                tint: .popsInventory, action: download)
        }
        .popsFadeIn()
    }
}
