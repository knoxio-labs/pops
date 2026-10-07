import DesignSystem
import SwiftUI

/// What reading the attached receipt came back with: nothing yet, a
/// suggestion to review, or the reason there is none. A receipt that cannot
/// be read is still attached, and every one of these says so.
internal struct GuestReceiptReadingView: View {
    @Binding internal var receipt: GuestReceiptState
    @Binding internal var draft: GuestTransactionDraft
    internal let accounts: [GuestAccount]

    private let presentation = GuestPresentation()

    private var currency: String? {
        draft.account(in: accounts)?.account.balance.currencyCode
    }

    internal var body: some View {
        switch receipt.reading {
        case .none:
            EmptyView()
        case .reading:
            HStack(spacing: PopsSpacing.sm) {
                ProgressView()
                Text(GuestReceiptCopy.reading)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .accessibilityElement(children: .combine)
        case .applied:
            GuestNotice(tone: .success, text: GuestReceiptCopy.applied)
        case .unreadable:
            GuestNotice(tone: .warning, text: GuestReceiptCopy.unreadable)
        case .unavailable:
            GuestNotice(tone: .information, text: GuestReceiptCopy.unavailable)
        case .suggested(let suggestion):
            suggested(suggestion)
        }
    }

    private func suggested(_ suggestion: GuestReceiptSuggestion) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.sm) {
                Text(GuestReceiptCopy.suggestionTitle)
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
                Spacer(minLength: PopsSpacing.sm)
                Button(GuestReceiptCopy.dismiss, systemImage: "xmark") {
                    receipt.reading = .none
                }
                .labelStyle(.iconOnly)
                .playgroundGlassButton()
                Button(GuestReceiptCopy.use, systemImage: "checkmark") {
                    draft = draft.applying(suggestion, accounts: accounts)
                    receipt.reading = .applied
                }
                .labelStyle(.iconOnly)
                .playgroundProminentGlassButton()
            }
            line("Date", suggestion.date.map(presentation.day))
            line("Description", suggestion.description)
            line("Amount", suggestion.total.map(presentation.money))
            if let total = suggestion.total, let currency,
                suggestion.currencyMismatch(with: currency)
            {
                GuestNotice(
                    tone: .warning,
                    text: GuestReceiptCopy.mismatch(receipt: total.currencyCode, account: currency))
            }
        }
        .popsPanelInsets()
        .popsPanelGround()
    }

    private func line(_ title: String, _ value: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
                .foregroundStyle(Color.popsMutedForeground)
            Spacer(minLength: PopsSpacing.sm)
            Text(value ?? GuestReceiptCopy.unread)
                .foregroundStyle(value == nil ? Color.popsMutedForeground : Color.popsForeground)
                .multilineTextAlignment(.trailing)
        }
        .font(.popsSubheadline)
        .accessibilityElement(children: .combine)
    }
}
