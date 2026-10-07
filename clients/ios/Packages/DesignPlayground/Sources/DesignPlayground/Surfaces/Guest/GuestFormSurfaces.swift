extension GuestSurfaces {
    private static var filled: GuestTransactionDraft {
        GuestTransactionDraft(
            accountID: GuestFixtures.ledger.id, kindID: GuestEntryKind.ownerPaidForMe.id,
            date: GuestFixtures.groceries.date, amountText: "84.12",
            description: "Groceries, Harris Farm")
    }

    private static var ledgerOnly: [GuestAccount] { [GuestFixtures.ledger] }

    private static func form(_ stage: GuestFormStage) -> GuestTransactionFormView {
        GuestTransactionFormView(stage: stage)
    }

    internal static var formSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "guest", slug: "transaction-form"),
            title: "Add or edit an entry",
            synopsis: "Account, type, date, amount and description, saved from the bar.",
            chrome: .sheet,
            states: formStates + failureStates,
            backdrop: {
                GuestAccountDetailView(
                    account: GuestFixtures.ledger, entries: .loaded(GuestFixtures.ledgerEntries))
            }
        )
    }

    private static var formStates: [DesignState] {
        [
            DesignState("new", "New, one account to write to") {
                form(GuestFormStage(accounts: GuestFixtures.accounts))
            },
            DesignState("filled", "Filled in, ready to save") {
                form(GuestFormStage(accounts: ledgerOnly, draft: filled))
            },
            DesignState("choose-account", "Two accounts to choose from") {
                form(
                    GuestFormStage(
                        accounts: [GuestFixtures.ledger, GuestFixtures.householdEditable]))
            },
            DesignState("problems", "Saved with gaps") {
                form(GuestFormStage(accounts: ledgerOnly, showsProblems: true))
            },
            DesignState("edit", "Editing an entry") {
                form(GuestFormStage(accounts: ledgerOnly, mode: .edit(GuestFixtures.dinner)))
            },
            DesignState("saving", "Saving") {
                form(GuestFormStage(accounts: ledgerOnly, draft: filled, save: .saving))
            },
        ]
    }

    private static var failureStates: [DesignState] {
        [
            DesignState("save-failed", "Not saved, what was typed kept") {
                form(
                    GuestFormStage(
                        accounts: ledgerOnly, draft: filled, save: .failed(.unreachable)))
            },
            DesignState("offline", "Offline") {
                form(GuestFormStage(accounts: ledgerOnly, draft: filled, offline: true))
            },
            DesignState("access-revoked", "Access revoked while typing") {
                form(
                    GuestFormStage(
                        accounts: ledgerOnly, draft: filled, save: .failed(.accessRevoked)))
            },
            DesignState("read-only", "Role dropped to view while typing") {
                form(
                    GuestFormStage(accounts: ledgerOnly, draft: filled, save: .failed(.readOnly)))
            },
        ]
    }

    internal static var receiptSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "guest", slug: "receipt"),
            title: "Attach a receipt",
            synopsis: "A receipt added to an entry, and what reading it offers for review.",
            chrome: .sheet,
            states: receiptStates,
            backdrop: {
                GuestAccountDetailView(
                    account: GuestFixtures.ledger, entries: .loaded(GuestFixtures.ledgerEntries))
            }
        )
    }

    private static func receipt(
        pages: Int = 1, _ reading: GuestReceiptReading, mode: GuestFormMode = .new
    ) -> GuestTransactionFormView {
        form(
            GuestFormStage(
                accounts: ledgerOnly, mode: mode,
                receipt: GuestReceiptState(pages: GuestFixtures.paper(pages), reading: reading)))
    }

    private static var receiptStates: [DesignState] {
        [
            DesignState("suggested", "Read, suggestion to review") {
                receipt(.suggested(GuestFixtures.receiptSuggestion))
            },
            DesignState("reading", "Reading") {
                receipt(.reading)
            },
            DesignState("applied", "Suggestion used") {
                form(
                    GuestFormStage(
                        accounts: ledgerOnly, draft: filled,
                        receipt: GuestReceiptState(
                            pages: GuestFixtures.paper(1), reading: .applied)))
            },
            DesignState("several-pages", "Several pages") {
                receipt(pages: 4, .suggested(GuestFixtures.receiptSuggestion))
            },
            DesignState("partial", "Read, date not found") {
                receipt(.suggested(GuestFixtures.partialSuggestion))
            },
            DesignState("currency-mismatch", "Receipt in another currency") {
                receipt(.suggested(GuestFixtures.foreignSuggestion))
            },
            DesignState("unreadable", "Could not be read") {
                receipt(.unreadable)
            },
            DesignState("unavailable", "Reading unavailable") {
                receipt(.unavailable)
            },
            DesignState("existing", "Adding to an entry that has receipts") {
                receipt(.reading, mode: .edit(GuestFixtures.tickets))
            },
        ]
    }
}
