import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseDetailMatchRow: View {
    internal let status: PurchaseSettlement
    internal var matchedOf: String?
    internal var unmatched: String?
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget - PopsSpacing.xs

    internal var body: some View {
        let tone = PurchasesPresentation.tone(for: status)
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: PurchaseDetailCopy.matchSymbol(for: status))
                .font(.popsHeadline)
                .foregroundStyle(tone)
                .frame(width: markSize, height: markSize)
                .background(tone.opacity(0.14), in: .circle)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(PurchaseDetailCopy.match(for: status))
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                if let matchedOf {
                    Text(matchedOf)
                        .font(.popsSubheadline)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsForeground)
                }
                if let unmatched {
                    Text(unmatched)
                        .font(.popsCaption)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            Spacer(minLength: PopsSpacing.zero)
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }
}
