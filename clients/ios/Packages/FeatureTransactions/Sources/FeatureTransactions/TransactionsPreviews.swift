#if DEBUG

    import AppCore
    import Foundation
    import SwiftUI

    /// A repository for the canvas, and the only reason it sits in `Sources`
    /// rather than a test-support target: `#Preview` is compiled into the module
    /// it previews, so a fake in a separate target is not reachable from one.
    /// `#if DEBUG` keeps it out of anything shipped, and
    /// `ModuleBoundaryTests.fakesAreTestOnly` keeps `AppCoreFakes` out of here.
    private struct PreviewTransactionsRepository: TransactionsRepository {
        let pages: [TransactionPage]
        let failure: RepositoryError?

        func transactions(after cursor: String?) async throws -> TransactionPage {
            if let failure { throw failure }
            let index = cursor.flatMap(Int.init) ?? 0
            guard index < pages.count else {
                return TransactionPage(transactions: [], nextCursor: nil)
            }
            return pages[index]
        }
    }

    private enum PreviewData {
        static let rows: [AppCore.Transaction] = [
            AppCore.Transaction(
                id: "txn-1",
                description: "Flat white",
                amount: MoneyAmount(minorUnits: -540, currencyCode: "AUD"),
                date: Date(timeIntervalSince1970: 1_786_000_000),
                type: .purchase,
                entityName: "Sample Coffee",
                tags: ["coffee"]
            ),
            AppCore.Transaction(
                id: "txn-2",
                description: "Rent",
                amount: MoneyAmount(minorUnits: -124_000, currencyCode: "AUD"),
                date: Date(timeIntervalSince1970: 1_785_800_000),
                type: .transfer,
                entityName: "Landlord",
                tags: ["housing", "recurring"]
            ),
            AppCore.Transaction(
                id: "txn-3",
                description: "Salary",
                amount: MoneyAmount(minorUnits: 420_000, currencyCode: "AUD"),
                date: Date(timeIntervalSince1970: 1_785_600_000),
                type: .income,
                entityName: "Employer",
                tags: []
            ),
        ]

        static func page(_ nextCursor: String?) -> TransactionPage {
            TransactionPage(transactions: rows, nextCursor: nextCursor)
        }
    }

    @MainActor
    private func previewModel(
        pages: [TransactionPage] = [PreviewData.page(nil)],
        failing: RepositoryError? = nil
    ) -> TransactionsListViewModel {
        TransactionsListViewModel(
            dependencies: AppDependencies(
                transactions: PreviewTransactionsRepository(pages: pages, failure: failing),
                pairing: AppDependencies.unbound.pairing
            )
        )
    }

    #Preview("Transactions — light") {
        TransactionsListView(model: previewModel())
            .preferredColorScheme(.light)
    }

    #Preview("Transactions — dark") {
        TransactionsListView(model: previewModel())
            .preferredColorScheme(.dark)
    }

    /// More to come, so the canvas shows the tail of the list rather than only
    /// its middle.
    #Preview("More to load") {
        TransactionsListView(
            model: previewModel(pages: [PreviewData.page("1"), PreviewData.page(nil)]))
    }

    #Preview("Empty") {
        TransactionsListView(
            model: previewModel(pages: [TransactionPage(transactions: [], nextCursor: nil)])
        )
    }

    /// The canvas that matters most: finance being down must not look like
    /// having no transactions.
    #Preview("Finance unavailable") {
        TransactionsListView(model: previewModel(failing: .unavailable))
    }

    /// The size the layout has to survive, and the one nothing automated checks
    /// — see this package's README on that gap.
    #Preview("Accessibility text size") {
        TransactionsListView(model: previewModel())
            .dynamicTypeSize(.accessibility5)
    }

#endif
