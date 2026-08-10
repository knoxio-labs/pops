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
        var details: [AppCore.Transaction.ID: TransactionDetail] = [:]
        /// Never answers a detail fetch, so the canvas holds still on whatever
        /// was on screen before it. The only way to preview the seeded state:
        /// an empty `details` map is *not* it — that resolves to "finance no
        /// longer has this", which is a different screen entirely.
        var detailNeverAnswers = false

        func transactions(after cursor: String?) async throws -> TransactionPage {
            if let failure { throw failure }
            let index = cursor.flatMap(Int.init) ?? 0
            guard index < pages.count else {
                return TransactionPage(transactions: [], nextCursor: nil)
            }
            return pages[index]
        }

        func transactionDetail(id: AppCore.Transaction.ID) async throws -> TransactionDetail? {
            if let failure { throw failure }
            // Cancellable rather than a continuation nobody resumes: the canvas
            // going away cancels the `.task`, and the model treats that as the
            // non-event it is.
            if detailNeverAnswers { try await Task.sleep(for: .seconds(3600)) }
            return details[id]
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

        static let detail = TransactionDetail(
            id: "txn-1",
            description: "Flat white",
            amount: MoneyAmount(minorUnits: -540, currencyCode: "AUD"),
            date: Date(timeIntervalSince1970: 1_786_000_000),
            type: .purchase,
            account: "Everyday",
            entityName: "Sample Coffee",
            entityId: "entity-1",
            tags: ["coffee"],
            location: "Surry Hills",
            country: "Australia",
            notes: "Before the standup.",
            relatedTransactionId: nil,
            lastEditedAt: Date(timeIntervalSince1970: 1_786_100_000)
        )

        static func page(_ nextCursor: String?) -> TransactionPage {
            TransactionPage(transactions: rows, nextCursor: nextCursor)
        }
    }

    private func previewRepository(
        pages: [TransactionPage] = [PreviewData.page(nil)],
        failing: RepositoryError? = nil,
        details: [TransactionDetail] = [PreviewData.detail],
        detailNeverAnswers: Bool = false
    ) -> PreviewTransactionsRepository {
        PreviewTransactionsRepository(
            pages: pages,
            failure: failing,
            details: Dictionary(uniqueKeysWithValues: details.map { ($0.id, $0) }),
            detailNeverAnswers: detailNeverAnswers
        )
    }

    @MainActor
    private func previewModel(
        pages: [TransactionPage] = [PreviewData.page(nil)],
        failing: RepositoryError? = nil
    ) -> TransactionsListViewModel {
        TransactionsListViewModel(
            dependencies: AppDependencies(
                transactions: previewRepository(pages: pages, failing: failing),
                pairing: AppDependencies.unbound.pairing
            ),
            router: Router()
        )
    }

    @MainActor
    private func previewDetailModel(
        seed: AppCore.Transaction? = PreviewData.rows.first,
        failing: RepositoryError? = nil,
        details: [TransactionDetail] = [PreviewData.detail],
        detailNeverAnswers: Bool = false
    ) -> TransactionDetailViewModel {
        TransactionDetailViewModel(
            id: PreviewData.detail.id,
            seed: seed,
            dependencies: AppDependencies(
                transactions: previewRepository(
                    failing: failing, details: details, detailNeverAnswers: detailNeverAnswers),
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

    /// The whole feature as an embedder gets it — the list, a tappable row, and
    /// the detail it pushes to. The one canvas where the seam this ticket added
    /// is visible rather than only asserted.
    #Preview("Flow — list to detail") {
        TransactionsFlowView(
            dependencies: AppDependencies(
                transactions: previewRepository(),
                pairing: AppDependencies.unbound.pairing
            ),
            router: Router()
        )
    }

    #Preview("Detail — light") {
        TransactionDetailView(model: previewDetailModel())
            .preferredColorScheme(.light)
    }

    #Preview("Detail — dark") {
        TransactionDetailView(model: previewDetailModel())
            .preferredColorScheme(.dark)
    }

    /// The canvas that shows the seam working: what the reader sees for the
    /// instant before the fuller record lands, built from the row the list
    /// already had.
    ///
    /// The fetch is parked rather than answered with nothing. An empty `details`
    /// map would resolve to "finance no longer has this" and drop the seed, so
    /// this canvas would quietly show the not-found screen next door — the same
    /// picture under a label claiming otherwise.
    #Preview("Detail — seeded, still fetching") {
        TransactionDetailView(model: previewDetailModel(detailNeverAnswers: true))
    }

    /// A transaction deleted between the list and the tap. Must not read as a
    /// failure, and must not offer a retry.
    #Preview("Detail — no longer exists") {
        TransactionDetailView(model: previewDetailModel(seed: nil, details: []))
    }

    /// The failure that keeps its content: the list's row stays, with the
    /// reason above it.
    #Preview("Detail — failed over a seeded row") {
        TransactionDetailView(model: previewDetailModel(failing: .unavailable))
    }

    #Preview("Detail — failed with nothing to show") {
        TransactionDetailView(model: previewDetailModel(seed: nil, failing: .unavailable))
    }

    #Preview("Detail — accessibility text size") {
        TransactionDetailView(model: previewDetailModel())
            .dynamicTypeSize(.accessibility5)
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
