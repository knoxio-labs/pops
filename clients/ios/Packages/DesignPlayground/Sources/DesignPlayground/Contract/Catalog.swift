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
/// That drift is real, and `SurfaceRegistrationTests` is what makes it visible
/// rather than silent: it scans `Surfaces/` for `SurfaceID` literals and fails
/// when one of them is not in this list. Same shape as
/// `RenderComparisonTraitScanner` and `TokenDisciplineScanner` in
/// `DesignSystem` — a text scan, because nothing in the type system
/// distinguishes "a view" from "a view meant to be reviewed".
///
/// ## Why nothing here fetches
///
/// Most surfaces stage the view the app ships, driven by its real view model,
/// which means a repository has to answer them. Every one of those answers
/// comes from a literal in this package: each area declares its own stand-in
/// conforming to the public seam, and none of them opens a connection.
///
/// The stronger half of the guarantee is the package graph. This package links
/// `AppCore`, `DesignSystem` and the `Feature*` packages, and not one of them
/// depends on `Auth` or `BFMClient` — the only two modules in the tree that
/// hold key material or perform HTTP, a rule `ModuleBoundaryTests` enforces by
/// reading every manifest. So there is no code path from here that could reach
/// a network even by mistake. The playground works with the phone in flight
/// mode, on a plane, or considerably further away.
///
/// It also links no fake. `AppCoreFakes` is barred from every `Sources` tree
/// by `ModuleBoundaryTests.fakesAreTestOnly`, which is why each area writes
/// its own stand-in rather than reusing `InMemoryTransactionsRepository`.
@MainActor
internal enum Catalog {
    /// Registration order is editorial. The shell first, because it is what
    /// the app opens into; then the three features in the order a paired
    /// phone's tab bar puts them; then accounts, which is built and not yet
    /// offered; then pairing, which a paired phone never sees again.
    static let surfaces: [DesignSurface] =
        ShellSurfaces.surfaces
        + TransactionsSurfaces.surfaces
        + PurchasesSurfaces.surfaces
        + ReceiptSurfaces.surfaces
        + accountSurfaces
        + PairingSurfaces.surfaces

    private static let accountSurfaces: [DesignSurface] = [
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
