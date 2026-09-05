import AppCore
import DesignSystem
import SwiftUI

/// One account in a list or in the picker: mark, name, who it is with, and the
/// ledger-signed balance.
///
/// The name truncates and the balance does not: an account with no room left
/// for its name is still identified by its mark, and a balance cut in half
/// identifies nothing. `.lineLimit(1)` sits on the
/// name only; the balance carries no line limit and no `minimumScaleFactor`,
/// so it is what grows at the accessibility Dynamic Type sizes rather than
/// what gets clipped by them — Dynamic Type risk 1 in POPS-2811.
internal struct AccountRowView: View {
    internal let account: Account
    internal let markSize: AccountMarkSize
    internal let selected: Bool

    private let presentation = AccountPresentation()

    internal init(account: Account, markSize: AccountMarkSize = .medium, selected: Bool = false) {
        self.account = account
        self.markSize = markSize
        self.selected = selected
    }

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            AccountMarkView(account: account, size: markSize)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(account.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Text(subtitle)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(2)
            }
            Spacer(minLength: PopsSpacing.sm)
            balance
                // Never the side that gives up its space first: the row would
                // rather squeeze the name and subtitle column, which already
                // has a truncation strategy, than clip a figure that has none.
                .layoutPriority(1)
            if selected {
                Image(systemName: "checkmark")
                    .foregroundStyle(Color.popsAccent)
            }
        }
        .padding(.vertical, PopsSpacing.sm)
        .opacity(account.archived ? 0.55 : 1)
        // One element, one sentence — the same reasoning `TransactionRowView`
        // gives: VoiceOver reads a row as one utterance.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }

    private var subtitle: String {
        presentation.subtitle(account, kindLabel: AccountKindLabel.label(for: account.kind))
    }

    private var balance: some View {
        let reading = presentation.readBalance(account)
        return VStack(alignment: .trailing, spacing: PopsSpacing.xs) {
            Text(reading.amount)
                .font(.popsHeadline)
                .foregroundStyle(presentation.color(for: reading.tone))
            if let note = reading.note {
                Text(note)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    private var accessibilityLabel: String {
        let reading = presentation.readBalance(account)
        var parts = [account.name, subtitle, reading.amount]
        if let note = reading.note { parts.append(note) }
        if account.archived { parts.append(AccountsCopy.archivedTag) }
        return parts.joined(separator: ", ")
    }
}
