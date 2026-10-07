import AppCore
import DesignSystem
import SwiftUI

extension GuestTone {
    internal var color: Color {
        switch self {
        case .positive: .popsSuccess
        case .negative: .popsDestructive
        case .neutral: .popsForeground
        }
    }
}

/// A status line that may wrap, with room for one action at its trailing
/// edge. `PopsNotice` holds its text to one line, which a sentence saying
/// both what failed and what was kept does not fit.
internal struct GuestNotice<Action: View>: View {
    private let symbol: String
    private let tint: Color
    private let text: String
    private let action: Action

    internal init(
        symbol: String, tint: Color, text: String, @ViewBuilder action: () -> Action
    ) {
        self.symbol = symbol
        self.tint = tint
        self.text = text
        self.action = action()
    }

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Image(systemName: symbol)
                .font(.popsSubheadline)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(text)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: PopsSpacing.sm)
            action
        }
    }
}

extension GuestNotice where Action == EmptyView {
    internal init(symbol: String, tint: Color, text: String) {
        self.init(symbol: symbol, tint: tint, text: text) { EmptyView() }
    }

    internal init(tone: PopsStatusHeader.Tone, text: String) {
        self.init(symbol: tone.symbolName, tint: tone.color, text: text)
    }
}

/// The bar a screen wears while the phone has no connection.
internal struct GuestOfflineBar: View {
    internal var text = GuestCopy.offline

    internal var body: some View {
        GuestNotice(symbol: "wifi.slash", tint: .popsWarning, text: text)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial)
    }
}

/// The whole screen when no account is shared with the guest: on first
/// launch before anything is granted, and again if every grant is withdrawn.
internal struct GuestNothingSharedView: View {
    internal let email: String

    internal var body: some View {
        PopsStatusHeader(
            tone: .information, title: GuestCopy.noAccountsTitle,
            message: GuestCopy.noAccounts(email: email)
        )
        .padding(PopsSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.popsBackground)
    }
}

/// One ledger row: what it was, who paid and when, and the figure.
internal struct GuestEntryRow: View {
    internal let entry: GuestEntry
    internal let account: GuestAccount
    internal var namesAccount = false

    private let presentation = GuestPresentation()

    internal var body: some View {
        PopsRow(title: entry.description, subtitle: subtitle) {
            VStack(alignment: .trailing, spacing: PopsSpacing.xs) {
                Text(presentation.amount(entry, in: account))
                    .font(.popsMonospaced)
                    .foregroundStyle(amountColor)
                if !entry.attachments.isEmpty {
                    Image(systemName: "paperclip")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityLabel(GuestCopy.receipts)
                }
            }
        }
        .contentShape(Rectangle())
    }

    private var subtitle: String {
        presentation.rowSubtitle(entry, in: account, namingAccount: namesAccount)
    }

    private var amountColor: Color {
        !account.isPersonLedger && entry.amount.minorUnits > 0 ? .popsSuccess : .popsForeground
    }
}

/// A list of ledger rows, each opening its own page.
internal struct GuestEntryPanel: View {
    internal let entries: [GuestEntry]
    internal let accounts: [GuestAccount]
    internal var offline = false

    internal var body: some View {
        PopsListPanel {
            PopsDividedRows(rows: entries, leadingInset: PopsSpacing.zero) { entry in
                if let account = accounts.first(where: { $0.id == entry.accountID }) {
                    NavigationLink {
                        GuestEntryDetailView(entry: entry, account: account, offline: offline)
                    } label: {
                        GuestEntryRow(
                            entry: entry, account: account, namesAccount: accounts.count > 1)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
