import AppCore
import DesignSystem
import SwiftUI

/// One account in a list or in the picker: mark, name, who it is with, and the
/// ledger-signed balance.
///
/// Two columns while two columns are still two columns. At the text sizes
/// where they are not, the row stacks: the name and subtitle take the full
/// width and wrap, and the balance moves underneath them. ``AccountRowLayout``
/// owns that decision, so it is a value a test can assert rather than
/// something only a screenshot could show.
///
/// The side-by-side arm keeps the older trade-off — `.lineLimit(1)` on the
/// name, no line limit and no `minimumScaleFactor` on the balance, so a row
/// too narrow for both is identified by its mark and an intact figure rather
/// than by half a figure. That trade-off was applied at every size until
/// POPS-2900: at `.accessibility5` it left the name column about one
/// character wide, so the name became a stroke *and* the balance truncated
/// anyway — both halves of the row's identity lost rather than one traded for
/// the other. Squeezing a column only works while the column has somewhere to
/// be squeezed into.
internal struct AccountRowView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

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
        layout
            .padding(.vertical, PopsSpacing.sm)
            .opacity(account.archived ? 0.55 : 1)
            // One element, one sentence — the same reasoning `TransactionRowView`
            // gives: VoiceOver reads a row as one utterance.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabel)
    }

    @ViewBuilder private var layout: some View {
        if AccountRowLayout.stacks(at: dynamicTypeSize) {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                HStack(spacing: PopsSpacing.md) {
                    AccountMarkView(account: account, size: markSize)
                    // No line limit: the name has the whole width here, and
                    // wrapping it is what stacking bought.
                    identity(nameLineLimit: nil)
                    Spacer(minLength: PopsSpacing.sm)
                    selectionMark
                }
                balance(alignment: .leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            HStack(spacing: PopsSpacing.md) {
                AccountMarkView(account: account, size: markSize)
                identity(nameLineLimit: 1)
                Spacer(minLength: PopsSpacing.sm)
                balance(alignment: .trailing)
                    // Never the side that gives up its space first: the row would
                    // rather squeeze the name and subtitle column, which already
                    // has a truncation strategy, than clip a figure that has none.
                    .layoutPriority(1)
                selectionMark
            }
        }
    }

    private func identity(nameLineLimit: Int?) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(account.name)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(nameLineLimit)
                .truncationMode(.tail)
            Text(subtitle)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(nameLineLimit == nil ? nil : 2)
        }
    }

    @ViewBuilder private var selectionMark: some View {
        if selected {
            Image(systemName: "checkmark")
                .foregroundStyle(Color.popsAccent)
        }
    }

    private var subtitle: String {
        presentation.subtitle(account, kindLabel: AccountKindLabel.label(for: account.kind))
    }

    private func balance(alignment: HorizontalAlignment) -> some View {
        let reading = presentation.readBalance(account)
        return VStack(alignment: alignment, spacing: PopsSpacing.xs) {
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

/// Whether an account's name and its balance fit on one row.
///
/// A value rather than a modifier chain, for the reason `ReceiptLineLayout` in
/// `FeatureReceiptCapture` is one: a layout decision that exists only inside a
/// `body` is one a test can prove nothing about.
internal enum AccountRowLayout {
    /// Keyed on `isAccessibilitySize` rather than on a chosen threshold,
    /// because that is the boundary the platform itself draws between "larger
    /// text" and "text large enough that layouts have to change".
    internal static func stacks(at size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }
}
