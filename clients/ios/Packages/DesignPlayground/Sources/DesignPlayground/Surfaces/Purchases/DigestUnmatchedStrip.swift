import AppCore
import DesignSystem
import SwiftUI

/// The digest's unmatched strip: up to three overlapping marks, the count, and
/// where it goes.
///
/// Its own view because it is its own control. It opens the archive at the
/// unmatched scope, and the digest around it has nothing to say about that.
internal struct DigestUnmatchedStrip: View {
    internal let purchases: [Purchase]
    internal let markSize: CGFloat

    private var unsettled: [Purchase] { purchases.filter(\.status.isUnsettled) }

    internal var body: some View {
        NavigationLink {
            PurchasesArchiveView(loaded: purchases, paging: .end, scope: .unmatched)
        } label: {
            strip
        }
        .buttonStyle(.plain)
    }

    private var strip: some View {
        HStack(spacing: PopsSpacing.md) {
            HStack(spacing: -PopsSpacing.sm) {
                ForEach(unsettled.prefix(3)) { purchase in
                    PurchaseMark(purchase: purchase, size: markSize)
                        .overlay(
                            RoundedRectangle(cornerRadius: PopsRadius.control)
                                .strokeBorder(
                                    Color.popsBackground, lineWidth: PopsBorder.emphasis)
                        )
                }
            }
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("\(unsettled.count) unmatched")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text("Nothing in finance explains these yet.")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(2)
            }
            Spacer(minLength: PopsSpacing.sm)
            Image(systemName: "chevron.right")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .padding(PopsSpacing.md)
        .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .contentShape(.rect)
    }
}
