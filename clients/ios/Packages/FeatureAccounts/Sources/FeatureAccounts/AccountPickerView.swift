import AppCore
import DesignSystem
import SwiftUI

/// Picking an account, as the content of a sheet.
///
/// A reusable component rather than a route: `Router`/`Route` model full-screen
/// pushes, and a sheet is a different presentation style with its own
/// dismiss — forcing it through the stack would make "cancel" a pop that also
/// rewrites the navigation path underneath whatever screen opened the picker.
/// A call site presents this with a plain `.sheet(isPresented:)` or
/// `.sheet(item:)` and reads the account back through ``onSelect``.
///
/// There is no free-text account field in this app yet for a picker to sit
/// behind — `FeatureTransactions`'s detail screen shows an account's name as
/// plain text, not as a field that opens one of these. This view is built,
/// tested and ready for that call site rather than wired to one; see this
/// ticket's report for the gap.
///
/// No row height here is fixed in points: the keyboard covering half the
/// sheet decides how many rows are visible, never how tall one row is
/// allowed to be — the accessibility Dynamic Type sizes need the room.
public struct AccountPickerView: View {
    @State private var searchText = ""

    private let accounts: [Account]
    private let selectedID: Account.ID?
    private let onSelect: (Account) -> Void

    /// - Parameters:
    ///   - accounts: every account offered, active and archived alike.
    ///   - selectedID: the account already chosen, drawn with a checkmark.
    ///   - onSelect: called with the tapped account. Dismissing the sheet
    ///     afterwards is the call site's decision, not this view's — some
    ///     callers may want to confirm before closing.
    public init(
        accounts: [Account],
        selectedID: Account.ID? = nil,
        onSelect: @escaping (Account) -> Void
    ) {
        self.accounts = accounts
        self.selectedID = selectedID
        self.onSelect = onSelect
    }

    public var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            PopsTextField(placeholder: AccountsCopy.searchPlaceholder, text: $searchText)
                .padding(PopsSpacing.lg)
            PopsDivider()
            list
        }
        .background(Color.popsBackground)
        .navigationTitle(AccountsCopy.pickerTitle)
        .accessibilityIdentifier(AccountsAccessibility.picker)
    }

    @ViewBuilder private var list: some View {
        let sections = AccountPickerSections.build(from: accounts, query: searchText)
        if sections.active.isEmpty && sections.archived.isEmpty {
            EmptyStateView(message: AccountsCopy.empty)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    rows(sections.active)
                    if !sections.archived.isEmpty {
                        VStack(alignment: .leading, spacing: PopsSpacing.md) {
                            Text(AccountsCopy.sectionArchived)
                                .font(.popsSectionLabel)
                                .foregroundStyle(Color.popsMutedForeground)
                            rows(sections.archived)
                        }
                    }
                }
                .padding(PopsSpacing.lg)
            }
        }
    }

    private func rows(_ accounts: [Account]) -> some View {
        VStack(spacing: PopsSpacing.zero) {
            ForEach(accounts) { account in
                Button {
                    onSelect(account)
                } label: {
                    AccountRowView(
                        account: account, markSize: .medium, selected: account.id == selectedID)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier(AccountsAccessibility.pickerRow(account.id))
                if account.id != accounts.last?.id { PopsDivider() }
            }
        }
    }
}
