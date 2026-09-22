import AppCore
import DesignSystem
import SwiftUI

internal struct PurchaseStatusBadge: View {
    internal let status: PurchaseSettlement

    internal var body: some View {
        let tone = PurchasesPresentation.tone(for: status)
        Text(PurchasesPresentation.label(for: status))
            .font(.popsCaption)
            .fontWeight(.medium)
            .foregroundStyle(tone)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .background(tone.opacity(0.14), in: .rect(cornerRadius: PopsRadius.control))
            .lineLimit(1)
    }
}
