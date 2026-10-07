import DesignSystem
import SwiftUI

internal enum GuestEntriesState: Hashable, Sendable {
    case loading
    case loaded([GuestEntry])
}

/// One shared account: whose it is, where the balance stands in the guest's
/// own terms, and the entries behind it.
internal struct GuestAccountDetailView: View {
    internal let account: GuestAccount
    internal let entries: GuestEntriesState
    internal var offline = false
    internal var revoked = false

    @State private var adding = false

    internal var body: some View {
        Group {
            if revoked {
                NonRetryableErrorStateView(message: GuestCopy.accountRevoked)
            } else {
                record
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.popsBackground)
    }

    private var record: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg) {
                GuestAccountHeader(account: account)
                ledger
            }
            .padding(PopsSpacing.lg)
        }
        .safeAreaInset(edge: .top, spacing: PopsSpacing.zero) {
            if offline { GuestOfflineBar() }
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                activity
                if account.canEdit { add }
            }
        }
        .sheet(isPresented: $adding) {
            NavigationStack {
                GuestTransactionFormView(stage: GuestFormStage(accounts: [account]))
            }
        }
    }

    @ViewBuilder private var ledger: some View {
        switch entries {
        case .loading:
            PopsListSkeleton(rows: 4)
        case .loaded(let rows) where rows.isEmpty:
            PopsEmptyLine(text: GuestCopy.noEntries)
        case .loaded(let rows):
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                PopsSectionHeader(title: GuestCopy.entries, trailing: "\(rows.count)")
                GuestEntryPanel(entries: rows, accounts: [account], offline: offline)
            }
        }
    }

    private var activity: some View {
        NavigationLink {
            GuestHistoryView(scope: .account, state: .loaded(GuestFixtures.ledgerActivity))
                .navigationTitle(GuestHistoryCopy.accountTitle)
        } label: {
            Image(systemName: "clock.arrow.circlepath")
        }
        .accessibilityLabel(GuestHistoryCopy.accountTitle)
    }

    private var add: some View {
        Button("Add an entry", systemImage: "plus") { adding = true }
            .labelStyle(.iconOnly)
            .disabled(offline)
    }
}

internal struct GuestAccountHeader: View {
    internal let account: GuestAccount

    private let presentation = GuestPresentation()

    internal var body: some View {
        let reading = presentation.balance(account)
        return VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            HStack(spacing: PopsSpacing.md) {
                AccountMark(account: account.account)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(presentation.title(account))
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    Text(presentation.subtitle(account))
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(reading.caption)
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
                    .textCase(.uppercase)
                Text(reading.amount)
                    .font(.popsAmount)
                    .foregroundStyle(reading.tone.color)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        }
    }
}
