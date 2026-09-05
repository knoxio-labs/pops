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
enum Catalog {
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

    static let experiments: [DesignExperiment] = [
        DesignExperiment(
            id: "accounts-list-shape",
            question: "Does the accounts list read better as rows or as a card grid?",
            subject: SurfaceID(area: "accounts", slug: "list"),
            variants: [
                DesignVariant(
                    id: "rows",
                    title: "Rows",
                    note:
                        "A system List. Keeps the subtitle, gets search and swipe actions for free.",
                    surface: DesignSurface(
                        id: SurfaceID(area: "accounts", slug: "list"),
                        title: "Accounts",
                        chrome: .navigationAndTabs,
                        states: [
                            DesignState.standard {
                                AccountsListSurface(accounts: Fixtures.allAccounts)
                            }
                        ]
                    )
                ),
                DesignVariant(
                    id: "grid",
                    title: "Card grid",
                    note: "Two tiles per row. Scans faster; loses who the account is with.",
                    surface: DesignSurface(
                        id: SurfaceID(area: "accounts", slug: "list"),
                        title: "Accounts",
                        chrome: .navigationAndTabs,
                        states: [
                            DesignState.standard {
                                AccountsGridSurface(accounts: Fixtures.allAccounts)
                            }
                        ]
                    )
                ),
            ]
        ),
        DesignExperiment(
            id: "account-mark-identity",
            question:
                "Does an account read faster led by its kind, or by the institution it is held at?",
            subject: SurfaceID(area: "accounts", slug: "list"),
            status: .decided(
                variant: "institution",
                rationale:
                    "Institution-led, decided on the web 2026-09-03. The phone has not adopted it — `AccountMark` still leads with the kind glyph, which is what the Kind-led variant here is."
            ),
            variants: [
                DesignVariant(
                    id: "kind",
                    title: "Kind-led",
                    note:
                        "A glyph for the kind, tinted by whether the balance is an asset or a liability. What iOS draws today.",
                    surface: DesignSurface(
                        id: SurfaceID(area: "accounts", slug: "list"),
                        title: "Accounts",
                        chrome: .navigation,
                        states: [
                            DesignState.standard {
                                List(Fixtures.activeAccounts) { AccountListRow(account: $0) }
                            }
                        ]
                    )
                ),
                DesignVariant(
                    id: "institution",
                    title: "Institution-led",
                    note:
                        "Initials on the institution's own tint, kind demoted to the subtitle. The variant the web chose.",
                    surface: DesignSurface(
                        id: SurfaceID(area: "accounts", slug: "list"),
                        title: "Accounts",
                        chrome: .navigation,
                        states: [
                            DesignState.standard {
                                List(Fixtures.activeAccounts) { InstitutionLedRow(account: $0) }
                            }
                        ]
                    )
                ),
            ]
        ),
    ]

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
