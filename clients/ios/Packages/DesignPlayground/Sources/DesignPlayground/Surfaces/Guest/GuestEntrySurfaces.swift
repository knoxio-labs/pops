extension GuestSurfaces {
    internal static var transactionSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "guest", slug: "transaction"),
            title: "Entry",
            synopsis: "One entry and its receipts. Nothing here deletes or removes.",
            chrome: .navigation,
            states: [
                DesignState.standard {
                    GuestEntryDetailView(
                        entry: GuestFixtures.tickets, account: GuestFixtures.ledger)
                },
                DesignState("no-receipts", "No receipts") {
                    GuestEntryDetailView(
                        entry: GuestFixtures.dinner, account: GuestFixtures.ledger)
                },
                DesignState("view-only", "View role") {
                    GuestEntryDetailView(
                        entry: GuestFixtures.tickets, account: GuestFixtures.ledgerViewOnly)
                },
                DesignState("receipt-loading", "Receipt loading") {
                    GuestEntryDetailView(
                        entry: entry(with: [GuestFixtures.loadingReceipt]),
                        account: GuestFixtures.ledger)
                },
                DesignState("receipt-failed", "Receipt could not load") {
                    GuestEntryDetailView(
                        entry: entry(with: [GuestFixtures.failedReceipt]),
                        account: GuestFixtures.ledger)
                },
                DesignState("viewer-photo", "A photo opened") {
                    GuestEntryDetailView(
                        entry: GuestFixtures.tickets, account: GuestFixtures.ledger,
                        viewing: GuestFixtures.photoReceipt)
                },
                DesignState("viewer-pdf", "A three-page PDF opened") {
                    GuestEntryDetailView(
                        entry: GuestFixtures.tickets, account: GuestFixtures.ledger,
                        viewing: GuestFixtures.pdfReceipt)
                },
                DesignState("viewer-failed", "Opened, could not load") {
                    GuestEntryDetailView(
                        entry: entry(with: [GuestFixtures.failedReceipt]),
                        account: GuestFixtures.ledger, viewing: GuestFixtures.failedReceipt)
                },
            ]
        )
    }

    private static func entry(with attachments: [GuestAttachment]) -> GuestEntry {
        let base = GuestFixtures.groceries
        return GuestEntry(
            id: base.id, accountID: base.accountID, description: base.description,
            amount: base.amount, date: base.date, type: base.type, attachments: attachments)
    }

    internal static var historySurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "guest", slug: "transaction-history"),
            title: "History",
            synopsis: "Who added and changed one entry, with each value before and after.",
            chrome: .navigation,
            states: [
                DesignState.standard {
                    GuestHistoryView(scope: .entry, state: .loaded(GuestFixtures.ticketsHistory))
                },
                DesignState("created-only", "Added, never changed") {
                    GuestHistoryView(scope: .entry, state: .loaded(GuestFixtures.createdOnly))
                },
                DesignState("loading", "Loading") {
                    GuestHistoryView(scope: .entry, state: .loading)
                },
                DesignState("failed", "Could not load") {
                    GuestHistoryView(scope: .entry, state: .failed)
                },
            ]
        )
    }

    internal static var activitySurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "guest", slug: "account-activity"),
            title: "Activity",
            synopsis: "Every change on one account, deletions included. Read-only on the phone.",
            chrome: .navigation,
            states: [
                DesignState.standard {
                    GuestHistoryView(scope: .account, state: .loaded(GuestFixtures.ledgerActivity))
                },
                DesignState("nothing-deleted", "Nothing awaiting restore") {
                    GuestHistoryView(scope: .account, state: .loaded(GuestFixtures.ticketsHistory))
                },
                DesignState("empty", "Nothing recorded") {
                    GuestHistoryView(scope: .account, state: .loaded([]))
                },
                DesignState("loading", "Loading") {
                    GuestHistoryView(scope: .account, state: .loading)
                },
                DesignState("failed", "Could not load") {
                    GuestHistoryView(scope: .account, state: .failed)
                },
            ]
        )
    }
}
