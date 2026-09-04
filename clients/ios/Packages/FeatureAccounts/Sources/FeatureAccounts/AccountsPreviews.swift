#if DEBUG

    import AppCore
    import Foundation
    import SwiftUI

    /// A repository for the canvas, and the only reason it sits in `Sources`
    /// rather than a test-support target — see `TransactionsPreviews`'s note on
    /// the same shape.
    private struct PreviewAccountsRepository: AccountsRepository {
        let accounts: [Account]
        let failure: RepositoryError?
        var details: [Account.ID: AccountDetail] = [:]

        func accounts() async throws -> [Account] {
            if let failure { throw failure }
            return accounts
        }

        func accountDetail(id: Account.ID) async throws -> AccountDetail? {
            if let failure { throw failure }
            return details[id]
        }
    }

    private enum PreviewData {
        static let checking = Account(
            id: "acc-1", name: "Everyday", kind: .checking,
            balance: MoneyAmount(minorUnits: 428_140, currencyCode: "AUD"), archived: false,
            institutionName: "ANZ", balanceAsOf: Date(timeIntervalSince1970: 1_786_000_000),
            transactionCount: 1_842)

        static let creditCard = Account(
            id: "acc-2", name: "Amex", kind: .creditCard,
            balance: MoneyAmount(minorUnits: -213_755, currencyCode: "AUD"), archived: false,
            institutionName: "Amex", balanceAsOf: Date(timeIntervalSince1970: 1_786_000_000),
            transactionCount: 499)

        static let person = Account(
            id: "acc-3", name: "Marta", kind: .person,
            balance: MoneyAmount(minorUnits: -6_400, currencyCode: "AUD"), archived: false,
            contact: "Marta Ferreira", transactionCount: 9)

        static let archived = Account(
            id: "acc-4", name: "Old ING Orange", kind: .checking,
            balance: MoneyAmount(minorUnits: 0, currencyCode: "AUD"), archived: true,
            institutionName: "ING", transactionCount: 730)

        static let list = [checking, creditCard, person, archived]

        static let checkingDetail = AccountDetail(
            account: checking,
            history: (0..<12).map { index in
                AccountBalancePoint(
                    month: "2026-\(String(format: "%02d", index + 1))",
                    balanceMinorUnits: 380_000 + index * 4_000
                )
            },
            recentTransactions: [
                AppCore.Transaction(
                    id: "txn-1", description: "Flat white",
                    amount: MoneyAmount(minorUnits: -540, currencyCode: "AUD"),
                    date: Date(timeIntervalSince1970: 1_786_000_000), type: .purchase,
                    entityName: "Sample Coffee", tags: [])
            ]
        )
    }

    /// `AppCoreFakes.AppDependencies.fake` is test-only —
    /// `ModuleBoundaryTests.fakesAreTestOnly` keeps it out of `Sources` — so
    /// this constructs the container by hand, the same way
    /// `TransactionsPreviews` does.
    private func dependencies(accounts: any AccountsRepository) -> AppDependencies {
        AppDependencies(
            transactions: AppDependencies.unbound.transactions,
            pairing: AppDependencies.unbound.pairing,
            reachability: AppDependencies.unbound.reachability,
            receiptCapture: AppDependencies.unbound.receiptCapture,
            purchases: AppDependencies.unbound.purchases,
            accounts: accounts
        )
    }

    @MainActor
    private func previewListModel(
        accounts: [Account] = PreviewData.list,
        failing: RepositoryError? = nil
    ) -> AccountsListViewModel {
        AccountsListViewModel(
            dependencies: dependencies(
                accounts: PreviewAccountsRepository(accounts: accounts, failure: failing)),
            router: Router()
        )
    }

    @MainActor
    private func previewDetailModel(
        seed: Account? = PreviewData.checking,
        detail: AccountDetail? = PreviewData.checkingDetail,
        failing: RepositoryError? = nil
    ) -> AccountDetailViewModel {
        AccountDetailViewModel(
            id: PreviewData.checking.id,
            seed: seed,
            dependencies: dependencies(
                accounts: PreviewAccountsRepository(
                    accounts: PreviewData.list, failure: failing,
                    details: detail.map { [$0.account.id: $0] } ?? [:]))
        )
    }

    #Preview("Accounts — light") {
        AccountsListView(model: previewListModel())
            .preferredColorScheme(.light)
    }

    #Preview("Accounts — dark") {
        AccountsListView(model: previewListModel())
            .preferredColorScheme(.dark)
    }

    #Preview("Accounts — empty") {
        AccountsListView(model: previewListModel(accounts: []))
    }

    #Preview("Accounts — unavailable") {
        AccountsListView(model: previewListModel(failing: .unavailable))
    }

    #Preview("Accounts — accessibility text size") {
        AccountsListView(model: previewListModel())
            .dynamicTypeSize(.accessibility5)
    }

    #Preview("Picker") {
        AccountPickerView(accounts: PreviewData.list, selectedID: PreviewData.creditCard.id) { _ in
        }
    }

    #Preview("Picker — accessibility text size") {
        AccountPickerView(accounts: PreviewData.list) { _ in }
            .dynamicTypeSize(.accessibility5)
    }

    #Preview("Detail — checking") {
        AccountDetailView(model: previewDetailModel())
    }

    #Preview("Detail — accessibility text size") {
        AccountDetailView(model: previewDetailModel())
            .dynamicTypeSize(.accessibility5)
    }

    #Preview("Detail — no longer exists") {
        AccountDetailView(model: previewDetailModel(seed: nil, detail: nil))
    }

#endif
