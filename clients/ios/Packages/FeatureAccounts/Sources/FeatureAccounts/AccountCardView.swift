import AppCore
import DesignSystem
import SwiftUI

/// One account, as a tile in the list's two-column grid: a mark, a name and a
/// balance carried at once rather than in a table row, because a 393pt screen
/// has the width for two of them side by side.
///
/// The name and kind label truncate to one line each; the balance does not —
/// the same protection ``AccountRowView`` gives it, and for the same reason.
internal struct AccountCardView: View {
    internal let account: Account

    private let presentation = AccountPresentation()

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            AccountMarkView(account: account, size: .small)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(account.name)
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                Text(AccountKindLabel.label(for: account.kind))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
            balance
        }
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .opacity(account.archived ? 0.55 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }

    private var balance: some View {
        let reading = presentation.readBalance(account)
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
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
        var parts = [account.name, AccountKindLabel.label(for: account.kind), reading.amount]
        if let note = reading.note { parts.append(note) }
        if account.archived { parts.append(AccountsCopy.archivedTag) }
        return parts.joined(separator: ", ")
    }
}
