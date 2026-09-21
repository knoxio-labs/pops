/// The purchases tab whole — the decided digest inside the shell that carries
/// it, with the search the platform draws and the control that starts a
/// capture.
///
/// Separate from `purchases/list`, which stages the digest on its own. That
/// separation is the point: the list surface reviews the content, this one
/// reviews the bottom edge, and the two questions have different answers. A
/// single surface carrying both would be reviewed for whichever one the reader
/// noticed first.
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
            "The digest, the tab bar's own search, and the one control that starts a capture.",
        chrome: .bare,
        // The capture menu has no staged state. A `Menu` is presented by the
        // system on a tap and cannot be pinned open, so it is reviewed by
        // tapping it — the same answer POPS-2911 recorded for the pairing
        // scanner's viewfinder, and for the same reason: staging it would mean
        // drawing a facsimile of the thing being judged.
        states: [
            DesignState.standard {
                PurchasesShellView(purchases: PurchasesFixtures.history)
            },
            // Where a save lands. The row is marked where its date puts it
            // rather than lifted to the top — a purchase's place in the
            // history is when it happened, not when it was saved.
            DesignState("just-saved", "Just after saving a capture") {
                PurchasesShellView(
                    purchases: PurchasesFixtures.history, highlighted: "pur-tongli")
            },
            DesignState("empty", "No purchases yet") {
                PurchasesShellView(purchases: [])
            },
        ]
    )
}
