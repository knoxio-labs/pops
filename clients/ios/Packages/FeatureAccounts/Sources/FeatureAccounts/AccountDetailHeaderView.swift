import AppCore
import DesignSystem
import SwiftUI

/// The account dashboard's header: a large mark, the name, who it is with,
/// an archived tag when it applies, and the balance headline underneath.
///
/// The name carries no `.lineLimit` — it wraps rather than truncates, and the
/// balance sits on its own line below rather than beside it, so a long name
/// never squeezes the figure that matters most on this screen. That is
/// Dynamic Type risk 4 from POPS-2811: a long name should wrap before the
/// number does.
internal struct AccountDetailHeaderView: View {
    internal let account: Account

    private let presentation = AccountPresentation()

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            identity
            balance
        }
    }

    private var identity: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            AccountMarkView(account: account, size: .large)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(account.name)
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Text(subtitle)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.zero)
            if account.archived {
                IosArchivedTag()
            }
        }
    }

    private var subtitle: String {
        let name = presentation.subtitle(
            account, kindLabel: AccountKindLabel.label(for: account.kind))
        return "\(name) · \(AccountKindLabel.label(for: account.kind))"
    }

    private var balance: some View {
        let reading = presentation.readBalance(account)
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(presentation.balanceCaption(account))
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
                .textCase(.uppercase)
            Text(reading.amount)
                .font(.popsAmount)
                .foregroundStyle(presentation.color(for: reading.tone))
                // The one line on this screen that must never wrap: the
                // headline figure owns its own row, wide open beneath a name
                // that may have taken two or three, so it is never the one
                // asked to give up space.
                .fixedSize(horizontal: false, vertical: true)
            Text(asOfLine)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    private var asOfLine: String {
        let count = account.transactionCount.formatted(.number.locale(Locale(identifier: "en_AU")))
        let noun = account.transactionCount == 1 ? "transaction" : "transactions"
        return "\(presentation.asOfNote(account)) · \(count) \(noun)"
    }
}

/// A small "Archived" pill, local to this feature rather than a `DesignSystem`
/// primitive — `PopsStatusHeader.Tone` and `IosTag` from the web kit are close
/// but not the same shape, and one label used in exactly one place here is not
/// worth promoting into shared design tokens on its own.
private struct IosArchivedTag: View {
    var body: some View {
        Text(AccountsCopy.archivedTag)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsMutedForeground)
            .padding(.horizontal, PopsSpacing.sm)
            .padding(.vertical, PopsSpacing.xs)
            .background(Color.popsSurface, in: Capsule())
            .overlay(Capsule().stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline))
    }
}
