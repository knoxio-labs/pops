import AppCore
import DesignSystem
import SwiftUI

/// The coloured glyph that identifies an account before its name is read, in
/// the ``ExperimentCatalog/all``'s "kind-led" variant.
internal struct AccountMark: View {
    internal let account: Account
    internal var size: CGFloat = 34

    internal var body: some View {
        let colour = AccountExperimentPresentation.markColor(for: account.kind)
        return Image(systemName: AccountExperimentPresentation.symbol(for: account.kind))
            .font(.popsSubheadline.weight(.semibold))
            .foregroundStyle(colour)
            .frame(width: size, height: size)
            .background(colour.opacity(0.14), in: .rect(cornerRadius: PopsRadius.control))
            .accessibilityHidden(true)
    }
}

/// One account in a list: mark, name, who it is with, balance — the "kind-led"
/// variant's row.
internal struct AccountListRow: View {
    internal let account: Account

    internal var body: some View {
        let reading = AccountExperimentPresentation.read(account)
        return HStack(spacing: PopsSpacing.md) {
            AccountMark(account: account)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(account.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                Text(AccountExperimentPresentation.subtitle(account))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: PopsSpacing.sm)
            VStack(alignment: .trailing, spacing: PopsSpacing.xs) {
                Text(reading.amount)
                    .font(.popsHeadline)
                    .monospacedDigit()
                    .foregroundStyle(reading.tone.color)
                    .lineLimit(1)
                if let note = reading.note {
                    Text(note)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}
