import AppCore
import DesignSystem
import SwiftUI

/// One account on the phone. The header carries the whole identity and the
/// balance is the headline, because on a 393pt screen anything below the fold
/// is a decision to scroll.
///
/// The one action is a floating glass button rather than a full-width bar, so
/// it reads as the screen's single verb instead of one of a pair — and here it
/// is drawn in the real material rather than the CSS approximation the web
/// playground had to invent for it.
struct AccountSurface: View {
    let account: Account
    /// Whether the ledger disagrees with the most recent checkpoint. A fixture
    /// flag rather than a computation: what this screen is designed against is
    /// the *state*, and deriving it here would put a rule in a playground.
    var checkpointDisagrees = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                header
                factsCard
                recentCard
            }
            .padding(PopsSpacing.lg)
            .padding(.bottom, 96)
        }
        .background(Color.popsBackground)
        .overlay(alignment: .bottomTrailing) { addButton }
    }

    private var header: some View {
        let reading = AccountPresentation.read(account)
        return VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.md) {
                AccountMark(account: account, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(AccountPresentation.label(for: account.kind))
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    Text(AccountPresentation.subtitle(account))
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsForeground)
                }
            }

            Text(AccountPresentation.balanceCaption(account).uppercased())
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)

            if checkpointDisagrees {
                Label("Disagrees with a checkpoint", systemImage: "exclamationmark.triangle.fill")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsDestructive)
            }

            Text(reading.amount)
                .font(.popsAmount)
                .foregroundStyle(reading.tone.color)
                .minimumScaleFactor(0.6)
                .lineLimit(1)

            Text(
                "\(AccountPresentation.provenance(account)) · \(account.transactionCount.formatted()) transactions"
            )
            .font(.popsCaption)
            .foregroundStyle(Color.popsMutedForeground)
        }
    }

    private var factsCard: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text("This account")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                PopsDivider()
                fact("Kind", AccountPresentation.label(for: account.kind))
                if let institution = account.institutionName {
                    fact("Held at", institution)
                }
                if let contact = account.contact {
                    fact("With", contact)
                }
                if let expiry = account.expiresOn {
                    fact("Expires", AccountPresentation.day(expiry))
                }
                fact("Currency", account.balance.currencyCode)
            }
        }
    }

    private var recentCard: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text("Recent")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                PopsDivider()
                ForEach(Fixtures.recentLines, id: \.self) { line in
                    PopsRow(title: line.title, subtitle: line.when) {
                        Text(line.amount)
                            .font(.popsMonospaced)
                            .foregroundStyle(
                                line.isCredit ? Color.popsSuccess : Color.popsForeground)
                    }
                }
            }
        }
    }

    /// Fixed to the screen rather than the scrolling content, the way a real
    /// floating action is.
    private var addButton: some View {
        Button {
            // A playground has nothing to add to. The control exists to be
            // looked at, and doing nothing is more honest than a sheet that
            // pretends to write somewhere.
        } label: {
            Label("Add", systemImage: "plus")
                .font(.popsHeadline)
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.vertical, PopsSpacing.md)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.popsAccent)
        .playgroundGlass(in: .capsule)
        .padding(PopsSpacing.lg)
    }

    private func fact(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
            Spacer()
            Text(value)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
        }
    }
}
