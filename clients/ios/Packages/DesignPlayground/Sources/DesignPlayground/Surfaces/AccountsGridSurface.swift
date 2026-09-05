import AppCore
import DesignSystem
import SwiftUI

/// The accounts list as a two-column card grid rather than as rows.
///
/// The competing answer in the list-shape experiment. A tile carries a mark, a
/// name and a balance at once, which is the "scannable at a glance" bet — and
/// at 393pt there is width for two. What it costs is the subtitle: who the
/// account is with does not fit beside everything else, so a grid identifies
/// by mark and name alone.
internal struct AccountsGridSurface: View {
    let accounts: [Account]

    private let columns = [
        GridItem(.flexible(), spacing: PopsSpacing.md),
        GridItem(.flexible(), spacing: PopsSpacing.md),
    ]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PopsSpacing.lg, pinnedViews: [.sectionHeaders])
            {
                ForEach(sections, id: \.title) { section in
                    Section {
                        LazyVGrid(columns: columns, spacing: PopsSpacing.md) {
                            ForEach(section.accounts) { account in
                                tile(account)
                            }
                        }
                    } header: {
                        Text(section.title.uppercased())
                            .font(.popsSectionLabel)
                            .foregroundStyle(Color.popsMutedForeground)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, PopsSpacing.xs)
                            .background(Color.popsBackground)
                    }
                }
            }
            .padding(PopsSpacing.lg)
        }
        .background(Color.popsBackground)
    }

    private func tile(_ account: Account) -> some View {
        let reading = AccountPresentation.read(account)
        return VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            AccountMark(account: account, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(account.name)
                    .font(.popsSubheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(2)
                Text(AccountPresentation.label(for: account.kind))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
            Text(reading.amount)
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(reading.tone.color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(PopsSpacing.md)
        .background(Color.popsSurface, in: .rect(cornerRadius: PopsRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .opacity(account.archived ? 0.55 : 1)
    }

    private var sections: [(title: String, accounts: [Account])] {
        let active = accounts.filter { !$0.archived }
        return [
            ("Held", active.filter { $0.balance.minorUnits >= 0 }),
            ("Owed", active.filter { $0.balance.minorUnits < 0 }),
            ("Archived", accounts.filter(\.archived)),
        ].filter { !$0.1.isEmpty }
    }
}
