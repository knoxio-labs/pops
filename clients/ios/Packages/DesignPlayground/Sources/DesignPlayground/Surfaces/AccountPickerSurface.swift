import AppCore
import DesignSystem
import SwiftUI

/// Picking an account on a phone is a sheet, not the web's popover: it slides
/// from the bottom, it is reachable with a thumb, and the field it was opened
/// from stays visible behind it so the transaction being filed is never out of
/// sight.
///
/// The balance is on every row because the account being filed against is
/// chosen by what it holds as often as by its name — and it carries the same
/// ledger-signed reading the list uses, so a card in debt still shows red
/// here.
///
/// The web facsimile drew its own keyboard (`kit/ios-keyboard.tsx`) and its own
/// search field. Here `focusSearch` puts the cursor in a real `.searchable`
/// field, so the sheet is reviewed at the height the real keyboard leaves it —
/// which is the whole question that state was asking.
internal struct AccountPickerSurface: View {
    let accounts: [Account]
    var selected: Account.ID?
    var focusSearch = false

    @State private var query = ""
    @FocusState private var searchFocused: Bool

    var body: some View {
        List {
            Section {
                ForEach(active) { account in
                    row(account)
                }
            }
            if !archived.isEmpty {
                Section("Archived") {
                    ForEach(archived) { account in
                        row(account).opacity(0.55)
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Search accounts")
        .searchFocused($searchFocused)
        .overlay {
            if visible.isEmpty {
                EmptyStateView(message: "No account matches “\(query)”.")
            }
        }
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") {}
            }
        }
        .onAppear { searchFocused = focusSearch }
    }

    private func row(_ account: Account) -> some View {
        let reading = AccountPresentation.read(account)
        return HStack(spacing: PopsSpacing.md) {
            AccountMark(account: account)
            VStack(alignment: .leading, spacing: 2) {
                Text(account.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                Text(AccountPresentation.label(for: account.kind))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(reading.amount)
                .font(.popsSubheadline)
                .monospacedDigit()
                .foregroundStyle(reading.tone.color)
                .lineLimit(1)
            if account.id == selected {
                Image(systemName: "checkmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.popsAccent)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private var visible: [Account] {
        guard !query.isEmpty else { return accounts }
        return accounts.filter {
            $0.name.localizedCaseInsensitiveContains(query)
                || AccountPresentation.label(for: $0.kind).localizedCaseInsensitiveContains(query)
                || AccountPresentation.subtitle($0).localizedCaseInsensitiveContains(query)
        }
    }

    private var active: [Account] { visible.filter { !$0.archived } }
    private var archived: [Account] { visible.filter(\.archived) }
}

/// The transaction being filed, which is what the picker is presented over.
///
/// Not decoration: the sheet is the shape it is *because* this stays visible,
/// so a review that could not see it could not check the claim.
internal struct NewTransactionBackdrop: View {
    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text("New transaction")
                    .font(.popsLargeTitle)
                    .foregroundStyle(Color.popsForeground)
                Text("−A$48.20")
                    .font(.popsAmount)
                    .foregroundStyle(Color.popsForeground)
            }
            PopsCard {
                VStack(spacing: PopsSpacing.zero) {
                    PopsRow(title: "Date") {
                        Text("3 Sep 2026").font(.popsBody)
                            .foregroundStyle(Color.popsForeground)
                    }
                    PopsDivider()
                    PopsRow(title: "Account") {
                        HStack(spacing: PopsSpacing.xs) {
                            Text("Amex").font(.popsBody)
                            Image(systemName: "chevron.right").font(.system(size: 12))
                        }
                        .foregroundStyle(Color.popsAccent)
                    }
                    PopsDivider()
                    PopsRow(title: "Entity") {
                        Text("Woolworths").font(.popsBody)
                            .foregroundStyle(Color.popsForeground)
                    }
                }
            }
            Spacer()
        }
        .padding(PopsSpacing.lg)
    }
}
