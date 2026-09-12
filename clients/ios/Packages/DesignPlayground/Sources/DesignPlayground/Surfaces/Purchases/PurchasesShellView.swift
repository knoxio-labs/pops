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
    @State private var selected: Int = 1

    internal init(purchases: [Purchase], query: String = "", searching: Bool = false) {
        self.purchases = purchases
        _query = State(initialValue: query)
        _searching = State(initialValue: searching)
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
    /// A `Menu`, not a confirmation dialog. `confirmationDialog` is the native
    /// action sheet — `UIAlertController` underneath — and an alert
    /// controller's actions cannot carry an icon through any API SwiftUI
    /// exposes. A `Menu` is a real `UIMenu`, takes a `Label` per item, and is
    /// what iOS 26 reaches for when one control offers several ways to do the
    /// same thing.
    ///
    /// Four items and not three: the two pickers are separate because iOS's
    /// own are separate. Photos come from `PHPicker` and files from the
    /// document picker, and collapsing them behind one verb would promise a
    /// chooser that does not exist.
    ///
    /// A circle rather than a labelled button, matched in size to the search
    /// capsule the system draws under it so the two read as a pair rather than
    /// as one control and one accident.
    private var captureControl: some View {
        Menu {
            Button {
            } label: {
                Label("Scan a receipt", systemImage: "doc.viewfinder")
            }
            Button {
            } label: {
                Label("Choose photos", systemImage: "photo.on.rectangle")
            }
            Button {
            } label: {
                Label("Choose a file", systemImage: "folder")
            }
            Button {
            } label: {
                Label("Enter it by hand", systemImage: "square.and.pencil")
            }
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
    }

    private let captureDiameter: CGFloat = 56

    /// The other tabs hold a named placeholder rather than a second copy of a
    /// flow that has its own surface — the same rule ``ShellTabBarView``
    /// follows, and for the same reason.
    private func otherTab(_ name: String) -> some View {
        EmptyStateView(message: "\(name) fills the screen here. It has its own surface.")
    }
}
