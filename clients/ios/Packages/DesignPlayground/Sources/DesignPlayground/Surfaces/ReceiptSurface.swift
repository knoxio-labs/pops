import DesignSystem
import SwiftUI

/// A receipt as the phone shows it: who it was from, what it cost, and the
/// lines read off it.
///
/// The actions sit in a `PopsActionBar` attached with `.safeAreaInset`, which
/// is the arrangement that primitive documents and asks for — content scrolls
/// *under* the bar through a real material, rather than stopping above a flat
/// strip. That difference is one of the things the HTML facsimile could only
/// approximate, and it is visible here.
internal struct ReceiptSurface: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                header
                itemsCard
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom) {
            PopsActionBar {
                PopsButton("Attach to order", prominence: .prominent) {}
                PopsButton("Edit") {}
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(Fixtures.receipt.merchant)
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
            Text(Fixtures.receipt.when)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
            Text(Fixtures.receipt.total)
                .font(.popsAmount)
                .foregroundStyle(Color.popsForeground)
                .padding(.top, PopsSpacing.sm)
        }
    }

    private var itemsCard: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text("ITEMS")
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
                ForEach(Fixtures.receipt.lines, id: \.title) { line in
                    PopsRow(title: line.title, subtitle: line.when) {
                        Text(line.amount)
                            .font(.popsMonospaced)
                            .foregroundStyle(Color.popsForeground)
                    }
                }
            }
        }
    }
}
