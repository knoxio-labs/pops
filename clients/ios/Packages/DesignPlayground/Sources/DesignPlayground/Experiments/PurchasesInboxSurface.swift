import AppCore
import DesignSystem
import SwiftUI

/// **Inbox** — the reconciliation gap made the subject of the screen.
///
/// Two sections that are different in kind, not just in order. Everything
/// still waiting on somebody is a card at the top, large enough to carry the
/// reason it is open and the two answers to it. Everything already answered is
/// a compressed row below, deliberately duller than the cards above it.
///
/// The bet: of five real purchases, five are `awaiting_settlement` and none is
/// linked to anything. On that corpus a plain history is a list of work nobody
/// is being asked to do, and the screen should ask.
internal struct PurchasesInboxSurface: View {
    internal let purchases: [Purchase]

    private var unsettled: [Purchase] { purchases.filter(\.status.isUnsettled) }
    private var settled: [Purchase] { purchases.filter { !$0.status.isUnsettled } }

    internal var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if unsettled.isEmpty {
                    allClear
                } else {
                    sectionLabel("Needs you", count: unsettled.count)
                    ForEach(unsettled) { card($0) }
                }
                if !settled.isEmpty {
                    sectionLabel("Settled", count: settled.count)
                    VStack(spacing: PopsSpacing.zero) {
                        ForEach(settled) { purchase in
                            settledRow(purchase)
                            if purchase.id != settled.last?.id { PopsDivider() }
                        }
                    }
                }
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
    }

    private func sectionLabel(_ title: String, count: Int) -> some View {
        HStack(spacing: PopsSpacing.sm) {
            Text(title.uppercased())
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            Text("\(count)")
                .font(.popsCaption)
                .monospacedDigit()
                .foregroundStyle(Color.popsMutedForeground)
            Spacer(minLength: PopsSpacing.sm)
        }
    }

    /// The empty state of the queue, which is a different sentence from "you
    /// have no purchases" — there is a history here, it is simply all answered.
    private var allClear: some View {
        PopsCard {
            HStack(spacing: PopsSpacing.md) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsSuccess)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text("Everything is accounted for")
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text("Every purchase has a transaction behind it.")
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private func card(_ purchase: Purchase) -> some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                HStack(spacing: PopsSpacing.md) {
                    PurchaseMark(purchase: purchase)
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text(PurchasesPresentation.merchant(purchase))
                            .font(.popsHeadline)
                            .foregroundStyle(
                                PurchasesPresentation.isUnattributed(purchase)
                                    ? Color.popsMutedForeground : Color.popsForeground
                            )
                            .lineLimit(2)
                        Text(
                            "\(PurchasesPresentation.day(purchase)) · \(PurchasesPresentation.items(purchase))"
                        )
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                    }
                    Spacer(minLength: PopsSpacing.sm)
                    Text(purchase.total.formatted())
                        .font(.popsTitle)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsForeground)
                        .lineLimit(1)
                        .layoutPriority(1)
                }
                if let reason = PurchasesPresentation.reason(for: purchase) {
                    Text(reason)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsWarning)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: PopsSpacing.sm) {
                    PopsButton("Find the transaction", prominence: .prominent) {}
                    PopsButton("Paid cash") {}
                }
            }
        }
    }

    private func settledRow(_ purchase: Purchase) -> some View {
        HStack(spacing: PopsSpacing.md) {
            PurchaseMark(purchase: purchase, size: settledMark)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(PurchasesPresentation.merchant(purchase))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                PurchaseStatusBadge(status: purchase.status)
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(purchase.total.formatted())
                .font(.popsSubheadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.sm)
    }

    private let settledMark: CGFloat = 28
}
