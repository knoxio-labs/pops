import DesignSystem
import SwiftUI

internal enum GuestAccountsState: Hashable, Sendable {
    case loading
    case loaded([GuestAccount])
    case nothingShared(email: String)
    case failed
}

/// The accounts a guest was given, and nothing else: no sections, no search
/// and no archive switch, because a guest holds a handful at most.
internal struct GuestAccountsListView: View {
    internal let state: GuestAccountsState
    internal var offline = false

    internal var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Color.popsBackground)
            .safeAreaInset(edge: .top, spacing: PopsSpacing.zero) {
                if offline { GuestOfflineBar() }
            }
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .loading:
            PopsListSkeleton(rows: 2).padding(PopsSpacing.lg)
        case .nothingShared(let email):
            GuestNothingSharedView(email: email)
        case .failed:
            ErrorStateView(message: "Your accounts could not be loaded.") {}
        case .loaded(let accounts):
            ScrollView {
                PopsListPanel {
                    PopsDividedRows(rows: accounts) { account in
                        NavigationLink {
                            GuestAccountDetailView(
                                account: account,
                                entries: .loaded(GuestFixtures.entries(for: account)),
                                offline: offline)
                        } label: {
                            GuestAccountRow(account: account)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(PopsSpacing.lg)
            }
        }
    }
}

internal struct GuestAccountRow: View {
    internal let account: GuestAccount

    private let presentation = GuestPresentation()

    internal var body: some View {
        let reading = presentation.balance(account)
        return HStack(spacing: PopsSpacing.md) {
            AccountMark(account: account.account)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(presentation.title(account))
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                Text(presentation.subtitle(account))
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
                Text(reading.caption)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
