import AppCore
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
            id: "purchases-digest-finish",
            question:
                "Where does the purchases digest get its finish — from the system's own structure, from the material it is drawn in, or from the figures relating to each other?",
            subject: SurfaceID(area: "purchases", slug: "list"),
            status: .decided(
                variant: "composed",
                rationale:
                    "Composed, decided on the device 2026-09-12. None of the three won outright and the reviewer "
                    + "assembled one: Glass for the figure, the unmatched strip, Recent and the All-N control, "
                    + "because on a platform whose own chrome refracts a page of flat rectangles reads as a form "
                    + "from somewhere else; Grouped's ranked rows for Where it went, because a till name needs the "
                    + "width a chip scroller could not give it; and Grouped's delta line, which was singled out — "
                    + "the arrow and `less than Aug` is the one thing on the screen that says whether the figure "
                    + "above it is a lot. The share bars and the rank numeral both went: the order ranks the rows "
                    + "on its own and the two of them were spending exactly the width the merchant name was short "
                    + "of. What is given up is the share each merchant holds, which no longer appears anywhere on "
                    + "this screen — Chart is the record of what that looked like."
            ),
            variants: [
                purchasesVariant(
                    id: "composed",
                    title: "Composed",
                    note:
                        "Glass for the figure, the unmatched strip, Recent and All N; Grouped's delta line and its "
                        + "ranked rows with the share bars removed. Assembled from the other three, not chosen "
                        + "among them."
                ) { PurchasesDigestComposedSurface(purchases: $0) },
                purchasesVariant(
                    id: "draft",
                    title: "Draft",
                    note:
                        "What won `purchases-home-shape`, unchanged. The baseline the other three are arguing with, "
                        + "not a candidate."
                ) { PurchasesDigestSurface(purchases: $0) },
                purchasesVariant(
                    id: "grouped",
                    title: "Grouped",
                    note:
                        "Inset containers, dividers past the mark, a disclosure row where the button was, the "
                        + "unmatched banner promoted above the figure, and a delta against last month."
                ) { PurchasesDigestGroupedSurface(purchases: $0) },
                purchasesVariant(
                    id: "glass",
                    title: "Glass",
                    note:
                        "iOS 26 materials. The figure on glass over a tinted wash, the unmatched strip and the "
                        + "merchant chips likewise. Judge it on the device — this is the effect CSS cannot show."
                ) { PurchasesDigestGlassSurface(purchases: $0) },
                purchasesVariant(
                    id: "chart",
                    title: "Chart",
                    note:
                        "A month trend behind the figure, the backlog as a proportion answered rather than a tally, "
                        + "and each merchant carrying its share."
                ) { PurchasesDigestChartSurface(purchases: $0) },
            ]
        ),
        DesignExperiment(
            id: "purchases-home-shape",
            question:
                "Is the purchases home an archive, a queue of unmatched purchases, a digest, or the receipts themselves?",
            subject: SurfaceID(area: "purchases", slug: "list"),
            status: .decided(
                variant: "digest",
                rationale:
                    "Digest, decided on the device 2026-09-12. The tab was asked to do four jobs at once — find an "
                    + "old purchase, work down what is unmatched, see where the money went, and catch what was just "
                    + "photographed — and it is the only variant that gives each of them a lane instead of picking "
                    + "one and demoting the rest. Ledger and Paper answer the archive well and say nothing about the "
                    + "other three; Inbox answers triage and needs mobile reconcile routes that do not exist. What "
                    + "Digest gives up is density: the history is a band with four rows on it, reached by See all."
            ),
            variants: [
                purchasesVariant(
                    id: "ledger",
                    title: "Ledger",
                    note:
                        "One unbroken run in date order, cut by month, with the month's total in the header. "
                        + "Settlement is a dot on the mark, not a section."
                ) { PurchasesLedgerSurface(purchases: $0) },
                purchasesVariant(
                    id: "inbox",
                    title: "Inbox",
                    note:
                        "Unmatched purchases as cards that state why they are open and offer the two answers. "
                        + "Everything settled is compressed underneath."
                ) { PurchasesInboxSurface(purchases: $0) },
                purchasesVariant(
                    id: "digest",
                    title: "Digest",
                    note:
                        "The month's figure, the unmatched count, and where the money went — the history is the "
                        + "last band, reached by See all."
                ) { PurchasesDigestSurface(purchases: $0) },
                purchasesVariant(
                    id: "paper",
                    title: "Paper",
                    note:
                        "The receipt photograph leads every row. Argues against the merchant mark, and takes "
                        + "POPS-2452's \"show the captured image\" at the list rather than only the detail."
                ) { PurchasesPaperSurface(purchases: $0) },
            ]
        ),
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

extension ExperimentCatalog {
    /// One variant of the purchases home, in the two conditions worth
    /// comparing it in.
    ///
    /// The second state is the point of the pair. `PurchasesFixtures.history`
    /// is an archive somebody has been feeding for months; `all` is the five
    /// receipts the pillar actually holds, every one of them unmatched. A
    /// variant that reads well on the first and collapses on the second is a
    /// variant designed for a corpus that does not exist yet.
    @MainActor
    fileprivate static func purchasesVariant<Content: View>(
        id: String,
        title: String,
        note: String,
        content: @escaping ([Purchase]) -> Content
    ) -> DesignVariant {
        DesignVariant(
            id: id,
            title: title,
            note: note,
            surface: DesignSurface(
                id: SurfaceID(area: "purchases", slug: "list"),
                title: "Purchases",
                chrome: .navigationAndTabs,
                states: [
                    DesignState.standard { content(PurchasesFixtures.history) },
                    DesignState("today", "Today's five") {
                        content(PurchasesFixtures.all)
                    },
                    DesignState("empty", "Empty") { content([]) },
                ]
            )
        )
    }
}
