import AppCore
import DesignSystem
import SwiftUI

/// The accounts list at 393pt, sectioned by what the balance *is* — money you
/// can use, money you owe — rather than by kind.
///
/// The web playground draws this with a hand-built search field and a
/// hand-built collapsing title bar, because HTML has no other option. Here
/// both are the system's: `.searchable` puts a real search field in the
/// navigation bar, and the large title collapses because `NavigationStack`
/// collapses it. That difference is the entire argument for this app — the
/// two controls that were the most code in the facsimile are the two that are
/// now free, and they are also the two that carry the platform's glass.
struct AccountsListSurface: View {
    let accounts: [Account]
    @State private var searchText = ""
    @State private var showArchived = false

    var body: some View {
        List {
            ForEach(sections, id: \.title) { section in
                Section(section.title) {
                    ForEach(section.accounts) { account in
                        AccountListRow(account: account)
                    }
                }
            }
            if !archived.isEmpty {
                Section {
                    if showArchived {
                        ForEach(archived) { account in
                            AccountListRow(account: account).opacity(0.55)
                        }
                    }
                } header: {
                    Button {
                        withAnimation(.snappy) { showArchived.toggle() }
                    } label: {
                        HStack {
                            Text("Archived")
                            Spacer()
                            Image(systemName: showArchived ? "chevron.down" : "chevron.right")
                                .font(.system(size: 11, weight: .semibold))
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .searchable(text: $searchText, prompt: "Search accounts")
        .overlay {
            if visible.isEmpty && !searchText.isEmpty {
                EmptyStateView(message: "No account matches “\(searchText)”.")
            }
        }
    }

    private var visible: [Account] {
        guard !searchText.isEmpty else { return accounts }
        return accounts.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
                || AccountPresentation.subtitle($0).localizedCaseInsensitiveContains(searchText)
        }
    }

    private var archived: [Account] { visible.filter(\.archived) }

    private var sections: [(title: String, accounts: [Account])] {
        let active = visible.filter { !$0.archived }
        return [
            ("Held", active.filter { $0.balance.minorUnits >= 0 }),
            ("Owed", active.filter { $0.balance.minorUnits < 0 }),
        ].filter { !$0.1.isEmpty }
    }
}

/// One account in a list: mark, name, who it is with, balance.
///
/// The name truncates and the balance does not, which is the trade this width
/// forces — an account with no room for its name is still identified by its
/// mark, and a balance cut in half identifies nothing.
struct AccountListRow: View {
    let account: Account

    var body: some View {
        let reading = AccountPresentation.read(account)
        return HStack(spacing: PopsSpacing.md) {
            AccountMark(account: account)
            VStack(alignment: .leading, spacing: 2) {
                Text(account.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                Text(AccountPresentation.subtitle(account))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: PopsSpacing.sm)
            VStack(alignment: .trailing, spacing: 2) {
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
