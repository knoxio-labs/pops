/// The purchases tab whole: the home inside the shell that carries it, with
/// the search the platform draws and the control that starts a capture.
///
/// ``Chrome/bare`` because this draws a real `TabView` of its own. Staging it
/// under ``Chrome/tabbed`` would nest one inside another, where the inner bar
/// wins and the outer silently does nothing — the exact failure `ContentView`
/// documents for navigation stacks.
@MainActor
internal enum PurchasesHomeSurface {
    static let surface = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "home"),
        title: "Purchases home",
        synopsis:
            "The month's figure, the way into every purchase and the unmatched, and the capture control.",
        chrome: .bare,
        // The capture menu has no staged state. A `Menu` is presented by the
        // system on a tap and cannot be pinned open, so it is reviewed by
        // tapping it rather than as a facsimile.
        states: homeStates + searchStates
    )

    private static let history = PurchasesFixtures.history

    private static func home(_ phase: PurchasesHomePhase) -> PurchasesShellView {
        PurchasesShellView(purchases: history, home: phase)
    }

    private static let homeStates: [DesignState] = [
        DesignState.standard {
            PurchasesShellView(purchases: history)
        },
        // The five receipts the pillar holds today, all in one month, so the
        // figure has no earlier month and draws no delta.
        DesignState("today", "Today's five") {
            PurchasesShellView(purchases: PurchasesHomeFixtures.today)
        },
        // Lands where its date puts it, second, rather than on top: a
        // purchase's place in the history is when it happened.
        DesignState("just-saved", "Just after saving a capture") {
            PurchasesShellView(
                purchases: history,
                home: .loaded(PurchasesHomeFixtures.beforeSave),
                arriving: history.first { $0.id == PurchasesHomeFixtures.justSavedID })
        },
        DesignState("where-it-went", "Where the month went") {
            PurchasesShellView(purchases: history, list: .leaders)
        },
        DesignState("nothing-unmatched", "Nothing unmatched") {
            PurchasesShellView(purchases: PurchasesHomeFixtures.allMatched)
        },
        DesignState("empty", "No purchases yet") {
            PurchasesShellView(purchases: [])
        },
        DesignState("loading", "First load") {
            home(.loading)
        },
        DesignState("refreshing", "Refreshing what is shown") {
            home(.loaded(history, refresh: .refreshing))
        },
        DesignState("refresh-failed", "Refresh failed, content kept") {
            home(.loaded(history, refresh: .failed(updated: "9:41")))
        },
        DesignState("error-unavailable", "Pillar unavailable") {
            home(.failed(.unavailable))
        },
        DesignState("error-unauthorized", "Session ended") {
            home(.failed(.unauthorized))
        },
        DesignState("error-contract-mismatch", "Contract mismatch") {
            home(.failed(.contractMismatch))
        },
        DesignState("error-transport", "No connection") {
            home(.failed(.transport))
        },
        DesignState("error-dependency-not-bound", "Not wired up") {
            home(.failed(.dependencyNotBound))
        },
    ]

    // The searching states pin the field open rather than asking a reviewer
    // to tap into it, because what is being reviewed is the collapsed bar and
    // the expanded field together.
    private static let searchStates: [DesignState] = [
        DesignState("searching-empty", "Searching, nothing typed") {
            PurchasesShellView(purchases: history, searching: true)
        },
        DesignState("searching-merchant", "Searching a merchant") {
            PurchasesShellView(purchases: history, query: "wool", searching: true)
        },
        // `drill` matches no merchant and one line, which is the case the
        // whole item half of the search exists for.
        DesignState("searching-item", "Searching a product") {
            PurchasesShellView(purchases: history, query: "drill", searching: true)
        },
        DesignState("searching-tag", "Searching a tag") {
            PurchasesShellView(purchases: history, query: "grocery", searching: true)
        },
        DesignState("searching-nothing", "Searching, no matches") {
            PurchasesShellView(purchases: history, query: "zzzz", searching: true)
        },
    ]
}
