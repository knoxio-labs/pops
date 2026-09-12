import AppCore
import DesignSystem
import SwiftUI

/// The purchases tab as the app would actually draw it: the digest, the search
/// the platform gives a tab bar, and the one control that starts a capture.
///
/// **The bottom edge is the whole design here**, and it is drawn by the system
/// rather than by this file. `Tab(role: .search)` puts a magnifier in its own
/// capsule beside the tab bar, collapses the bar to a single glyph when it is
/// tapped, and expands a field into the space the bar gave up — which is the
/// arrangement the Slack screenshots show, because Slack is matching the same
/// iOS 26 pattern. Drawing our own row of capsules would be reimplementing
/// that, badly, and losing the minimize-on-scroll behaviour with it.
///
/// So the only thing this file places by hand is the capture control, and it
/// sits above the search capsule rather than beside it. Three things want this
/// corner — the bar, the search capsule, and this — and the one that is ours
/// is the one that has to move.
///
/// The tab set is three, not four: the receipts tab is gone, folded into the
/// capture control, which is the merge decided before the digest was.
internal struct PurchasesShellView: View {
    internal let purchases: [Purchase]

    @State private var query: String
    @State private var searching: Bool
    @State private var offeringCapture: Bool
    @State private var selected: Int = 1

    internal init(
        purchases: [Purchase],
        query: String = "",
        searching: Bool = false,
        offeringCapture: Bool = false
    ) {
        self.purchases = purchases
        _query = State(initialValue: query)
        _searching = State(initialValue: searching)
        _offeringCapture = State(initialValue: offeringCapture)
    }

    internal var body: some View {
        TabView(selection: $selected) {
            Tab("Transactions", systemImage: "list.bullet", value: 0) {
                otherTab("Transactions")
            }
            Tab("Purchases", systemImage: "cart", value: 1) {
                purchasesTab
            }
            Tab("Accounts", systemImage: "building.columns", value: 2) {
                otherTab("Accounts")
            }
            Tab(value: 3, role: .search) {
                NavigationStack {
                    PurchasesSearchResults(purchases: purchases, query: query)
                        .navigationTitle("Search")
                        .playgroundTitleDisplay(large: false)
                }
                .playgroundSearchable(
                    text: $query,
                    isPresented: $searching,
                    prompt: "Merchants, items and tags"
                )
            }
        }
        .playgroundMinimizingTabBar()
    }

    private var purchasesTab: some View {
        NavigationStack {
            PurchasesDigestComposedSurface(purchases: purchases)
                .navigationTitle("Purchases")
                .playgroundTitleDisplay(large: true)
                // An inset rather than an overlay: an overlaid control sits on
                // top of whatever the list's last row happens to be, and the
                // last row here is the All-N capsule, which it landed beside.
                // An inset reserves the height, so the content scrolls clear
                // of it instead of under it.
                .safeAreaInset(edge: .bottom, alignment: .trailing) { captureControl }
        }
    }

    /// A circle rather than a labelled button, matched in size to the search
    /// capsule the system draws under it so the two read as a pair rather than
    /// as one control and one accident.
    private var captureControl: some View {
        Button {
            offeringCapture = true
        } label: {
            Image(systemName: "plus")
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
                .frame(width: captureDiameter, height: captureDiameter)
        }
        .playgroundGlass(in: Circle())
        .padding(.trailing, PopsSpacing.lg)
        .padding(.top, PopsSpacing.sm)
        .accessibilityLabel("Add a purchase")
        .confirmationDialog(
            "Add a purchase", isPresented: $offeringCapture, titleVisibility: .visible
        ) {
            Button("Scan a receipt") {}
            Button("Choose photos") {}
            Button("Choose a file") {}
            Button("Enter it by hand") {}
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("A receipt is read for you. Entering by hand opens the same form, empty.")
        }
    }

    private let captureDiameter: CGFloat = 56

    /// The other tabs hold a named placeholder rather than a second copy of a
    /// flow that has its own surface — the same rule ``ShellTabBarView``
    /// follows, and for the same reason.
    private func otherTab(_ name: String) -> some View {
        EmptyStateView(message: "\(name) fills the screen here. It has its own surface.")
    }
}
