import AppCore
import DesignSystem
import SwiftUI

/// The competing answer in the `accounts-list-shape` experiment: a system
/// `List`, sectioned by what the balance *is* rather than by kind, with a
/// hand-built collapsing archived section.
internal struct AccountsListSurface: View {
    internal let accounts: [Account]
    @State private var searchText = ""
    @State private var showArchived = false

    internal var body: some View {
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
                                .font(.popsCaption.weight(.semibold))
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
                || AccountExperimentPresentation.subtitle($0)
                    .localizedCaseInsensitiveContains(searchText)
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
