import AppCore
import DesignSystem
import SwiftUI

/// Everything the playground can show.
///
/// ## Why this is a hand-written list
///
/// The web playground discovers its screens with `import.meta.glob`, so a file
/// in the right directory is registered by existing. Swift has no runtime
/// globbing, and the honest alternatives are a build-time generator or a list.
/// This is the list — one line per surface, and a surface not on it simply
/// does not appear.
///
/// That drift is real, and `CatalogTests` is what makes it visible rather than
/// silent: it scans the source tree for surface types and fails when one is
/// not registered, which is the same shape as `RenderComparisonTraitScanner`
/// and `TokenDisciplineScanner` — a text scan, because nothing in the type
/// system distinguishes "a view" from "a view meant to be reviewed".
///
/// ## Why nothing here fetches
///
/// Every state closes over a literal in ``Fixtures``. The package links
/// `AppCore` and `DesignSystem` and nothing else — no repository, no client,
/// no store — so there is no code path that could reach a network even by
/// mistake. The playground works with the phone in flight mode, on a plane,
/// or considerably further away.
@MainActor
internal enum Catalog {
    static let surfaces: [DesignSurface] = [
        DesignSurface(
            id: SurfaceID(area: "accounts", slug: "list"),
            title: "Accounts",
            synopsis: "Every account, sectioned by whether the balance is yours or owed.",
            chrome: .navigationAndTabs,
            states: [
                DesignState.standard {
                    AccountsListSurface(accounts: Fixtures.activeAccounts)
                },
                DesignState("archived", "With archived") {
                    AccountsListSurface(accounts: Fixtures.allAccounts)
                },
                DesignState("empty", "Empty") {
                    EmptyStateView(
                        message:
                            "No accounts yet. Accounts are created on the desktop; this is where they are read."
                    )
                },
                DesignState("one", "Single account") {
                    AccountsListSurface(accounts: [Fixtures.everyday])
                },
            ]
        ),
        DesignSurface(
            id: SurfaceID(area: "accounts", slug: "account"),
            title: "Account",
            synopsis:
                "One account: identity, the headline balance, and where the number came from.",
            chrome: .navigation,
            states: [
                DesignState.standard {
                    AccountSurface(account: Fixtures.everyday)
                },
                DesignState("liability", "Liability") {
                    AccountSurface(
                        account: Fixtures.amex,
                        checkpointDisagrees: Fixtures.disagreeingCheckpoints.contains(
                            Fixtures.amex.id)
                    )
                },
                DesignState("person", "Person ledger") {
                    AccountSurface(account: Fixtures.marta)
                },
                DesignState("stored-value", "Gift card") {
                    AccountSurface(account: Fixtures.giftCard)
                },
                DesignState("never-checked", "Never checked") {
                    AccountSurface(account: Fixtures.euros)
                },
                DesignState("long-name", "Name that truncates") {
                    AccountSurface(account: Fixtures.mortgage)
                },
            ]
        ),
        DesignSurface(
            id: SurfaceID(area: "accounts", slug: "picker"),
            title: "Account picker",
            synopsis:
                "Choosing the account a transaction is filed against, over the transaction itself.",
            chrome: .sheet,
            states: [
                DesignState.standard {
                    AccountPickerSurface(
                        accounts: Fixtures.activeAccounts, selected: Fixtures.amex.id)
                },
                DesignState("searching", "Searching") {
                    AccountPickerSurface(
                        accounts: Fixtures.activeAccounts, selected: Fixtures.amex.id,
                        focusSearch: true)
                },
                DesignState("archived", "Archived revealed") {
                    AccountPickerSurface(accounts: Fixtures.allAccounts, selected: Fixtures.amex.id)
                },
            ],
            backdrop: { NewTransactionBackdrop() }
        ),
        DesignSurface(
            id: SurfaceID(area: "receipts", slug: "receipt"),
            title: "Receipt",
            synopsis: "What was read off a photographed receipt, and what can be done with it.",
            chrome: .navigation,
            states: [
                DesignState.standard { ReceiptSurface() },
                DesignState("loading", "Reading") {
                    LoadingStateView(message: "Reading the receipt\u{2026}")
                },
                DesignState("empty", "Nothing read") {
                    EmptyStateView(message: "No lines were read from this receipt.")
                },
                DesignState("error", "Unreadable") {
                    ErrorStateView(
                        message: "The receipt could not be read.", retryTitle: "Try again"
                    ) {}
                },
            ]
        ),
        DesignSurface(
            id: SurfaceID(area: "shell", slug: "states"),
            title: "Whole-screen states",
            synopsis: "What a screen shows when it has nothing, is waiting, or failed.",
            chrome: .navigationLarge,
            states: [
                DesignState("loading", "Loading") {
                    LoadingStateView(message: "Loading accounts…")
                },
                DesignState("empty", "Empty") {
                    EmptyStateView(message: "No transactions in this period.")
                },
                DesignState("error", "Error") {
                    ErrorStateView(message: "Could not reach the server.", retryTitle: "Try again")
                    {}
                },
            ]
        ),
    ]

    static let experiments: [DesignExperiment] = ExperimentCatalog.all

    static let components: [DesignComponent] = ComponentCatalog.all

    /// Areas in the order they were registered, deduplicated. Not sorted:
    /// registration order is an editorial decision about what matters most,
    /// and alphabetising would hand it to the alphabet.
    static var areas: [String] {
        var seen: Set<String> = []
        return surfaces.compactMap { seen.insert($0.id.area).inserted ? $0.id.area : nil }
    }

    static func surfaces(in area: String) -> [DesignSurface] {
        surfaces.filter { $0.id.area == area }
    }
}
