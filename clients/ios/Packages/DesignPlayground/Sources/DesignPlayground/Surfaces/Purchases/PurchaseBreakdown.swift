import AppCore
import DesignSystem
import SwiftUI

/// What a saved purchase came to, in the five figures the mobile route carries.
///
/// Its own view because the detail screen had outgrown the length limit, and
/// this is the part of it that is arithmetic rather than identity.
internal struct PurchaseBreakdown: View {
    internal let detail: PurchaseDetail

    /// The five figures the route carries, and only the ones that are not
    /// zero — four rows reading nil is a purchase described by what it did not
    /// have. The total is repeated at the foot because a breakdown whose sum
    /// is elsewhere is a breakdown nobody can check.
    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            DigestSectionLabel(title: "What it came to")
            VStack(spacing: PopsSpacing.zero) {
                figure("Items", detail.subtotal)
                figure("Tax", detail.tax)
                figure("Delivery", detail.shipping)
                figure("Discount", detail.discount, negative: true)
                figure("Surcharge", detail.surcharge)
                PopsDivider()
                figure("Total", detail.purchase.total, emphasised: true)
            }
            .padding(.horizontal, PopsSpacing.md)
            .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        }
    }

    @ViewBuilder private func figure(
        _ label: String, _ amount: MoneyAmount, negative: Bool = false, emphasised: Bool = false
    ) -> some View {
        if amount.minorUnits != 0 || emphasised {
            HStack(spacing: PopsSpacing.md) {
                Text(label)
                    .font(emphasised ? .popsHeadline : .popsSubheadline)
                    .foregroundStyle(
                        emphasised ? Color.popsForeground : Color.popsMutedForeground)
                Spacer(minLength: PopsSpacing.sm)
                Text(negative ? "−\(amount.formatted())" : amount.formatted())
                    .font(emphasised ? .popsHeadline : .popsSubheadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
            }
            .padding(.vertical, PopsSpacing.md)
        }
    }
}
