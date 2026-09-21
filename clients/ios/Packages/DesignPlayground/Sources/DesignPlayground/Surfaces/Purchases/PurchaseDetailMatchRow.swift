import AppCore
import DesignSystem
import SwiftUI

/// Where the purchase stands against the bank, as one row in Inventory's
/// panel: the state's glyph on the archive badge's tone, and the state in
/// words.
///
/// The mobile route carries the status and nothing about the transaction
/// behind it, so the row states the match and opens nothing.
internal struct PurchaseDetailMatchRow: View {
    internal let status: PurchaseSettlement
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget - PopsSpacing.xs

    internal var body: some View {
        let tone = PurchasesPresentation.tone(for: status)
        InventoryGroundedListPanel {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: PurchaseDetailCopy.matchSymbol(for: status))
                    .font(.popsHeadline)
                    .foregroundStyle(tone)
                    .frame(width: markSize, height: markSize)
                    .background(tone.opacity(0.14), in: .circle)
                    .accessibilityHidden(true)
                Text(PurchaseDetailCopy.match(for: status))
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: PopsSpacing.zero)
            }
            .padding(.vertical, PopsSpacing.xs)
            .accessibilityElement(children: .combine)
        }
    }
}
