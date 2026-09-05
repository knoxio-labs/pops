import SwiftUI

/// The questions asked about a surface, and the answers competing to settle
/// them.
///
/// Split out of ``Catalog`` rather than listed there because a catalogue of
/// three kinds in one type outgrows what a reader can hold — the same reason
/// ``ComponentCatalog`` is its own file. ``Catalog`` still names all three, so
/// there is one place to look for what the playground contains.
///
/// A decided or archived experiment stays here. What was chosen, and why, is
/// the part worth keeping: a design decision with no record of the alternative
/// is one that gets relitigated every time somebody new looks at the screen.
@MainActor
internal enum ExperimentCatalog {
    internal static let all: [DesignExperiment] = [
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
                    "Institution-led, decided on the web 2026-09-03. The phone has not adopted it — `AccountMark` "
                    + "still leads with the kind glyph, which is what the Kind-led variant here is."
            ),
            variants: [
                DesignVariant(
                    id: "kind",
                    title: "Kind-led",
                    note:
                        "A glyph for the kind, tinted by whether the balance is an asset or a liability. What iOS "
                        + "draws today.",
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
                        "Initials on the institution's own tint, kind demoted to the subtitle. The variant the web "
                        + "chose.",
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
}
