import DesignSystem
import SwiftUI

/// The five fields, in the order a person says them: how much, on which
/// account, who paid, when, and what for.
internal struct GuestFormFields: View {
    @Binding internal var draft: GuestTransactionDraft
    internal let accounts: [GuestAccount]
    internal let problems: Set<GuestTransactionDraft.Field>

    private let presentation = GuestPresentation()

    private var writable: [GuestAccount] { accounts.filter(\.canEdit) }
    private var account: GuestAccount? { draft.account(in: accounts) }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            PopsTextField(
                amountLabel, placeholder: "0.00", text: $draft.amountText, font: .popsAmount,
                keyboard: .decimal, note: note(.amount))
            VStack(alignment: .leading, spacing: PopsSpacing.zero) {
                choice("Account", problem: .account) { accountValue }
                PopsDivider()
                choice("Type", problem: .kind) { kindPicker }
                PopsDivider()
                PopsRow(title: "Date") {
                    DatePicker(
                        "Date", selection: $draft.date, in: ...GuestFixtures.today,
                        displayedComponents: .date
                    )
                    .labelsHidden()
                }
            }
            PopsTextField(
                "Description", placeholder: "What it was for", text: $draft.description,
                note: note(.description))
        }
    }

    private var amountLabel: String {
        guard let code = account?.account.balance.currencyCode else { return "Amount" }
        return "Amount, \(code)"
    }

    private func note(_ field: GuestTransactionDraft.Field) -> PopsFieldNote? {
        problems.contains(field) ? .problem(GuestFormCopy.problem(field)) : nil
    }

    private func choice<Value: View>(
        _ title: String, problem: GuestTransactionDraft.Field, @ViewBuilder value: () -> Value
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.zero) {
            PopsRow(title: title) { value() }
            if problems.contains(problem) {
                Text(GuestFormCopy.problem(problem))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsDestructive)
                    .padding(.bottom, PopsSpacing.sm)
            }
        }
    }

    @ViewBuilder private var accountValue: some View {
        if writable.count > 1 {
            Picker("Account", selection: chosenAccount) {
                Text("Choose").tag(String?.none)
                ForEach(writable) { account in
                    Text(presentation.title(account)).tag(String?.some(account.id))
                }
            }
            .pickerStyle(.menu)
            .fixedSize()
        } else {
            Text(account.map(presentation.title) ?? "None")
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    private var chosenAccount: Binding<String?> {
        Binding {
            draft.accountID
        } set: { id in
            if let account = writable.first(where: { $0.id == id }) {
                draft.choose(account)
            } else {
                draft.accountID = nil
            }
        }
    }

    private var kindPicker: some View {
        Picker("Type", selection: $draft.kindID) {
            Text("Choose").tag(String?.none)
            if let account {
                ForEach(GuestEntryKind.options(for: account)) { kind in
                    Text(GuestCopy.label(kind, owner: account.owner)).tag(String?.some(kind.id))
                }
            }
        }
        .pickerStyle(.menu)
        .fixedSize()
        .disabled(account == nil)
    }
}
