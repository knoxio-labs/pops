import AppCore
import DesignSystem
import SwiftUI

/// Every purchase, by month: what the home's All tile opens, and what its
/// Unmatched tile opens with the scope already set.
///
/// ## One screen, two ways in
///
/// Both tiles lead to one list at two scopes, not to two screens. `Inbox` was
/// the unmatched purchases on a screen of their own, with the two answers as
/// buttons, and it was rejected because bfm proxies no reconcile route: there
/// is nothing for those buttons to do. The day reconcile reaches the phone,
/// the unmatched scope is where its actions go.
///
/// ## It pages, and the bottom is where that is said
///
/// Shimmering rows while the next page loads, a failure with a retry, or the
/// end. Only the failure is drawn as an error, because it is the only one
/// that is.
///
/// ## Ledger's structure, the home's rows
///
/// One run, newest first, cut by month under a pinned glass header carrying
/// the month's total. The rows and their panels are the home's, which are
/// Inventory's, so a purchase reads the same wherever it is found.
internal struct PurchasesArchiveView: View {
    internal let loaded: [Purchase]

    @State private var paging: ArchivePaging
    @State private var scope: ArchiveScope

    internal init(
        loaded: [Purchase], paging: ArchivePaging = .loading, scope: ArchiveScope = .all
    ) {
        self.loaded = loaded
        _paging = State(initialValue: paging)
        _scope = State(initialValue: scope)
    }

    private var months: [ArchiveMonth] {
        PurchasesArchive.months(loaded, scope: scope, paging: paging)
    }

    internal var body: some View {
        ScrollView {
            LazyVStack(
                alignment: .leading, spacing: PopsSpacing.lg, pinnedViews: [.sectionHeaders]
            ) {
                if loaded.isEmpty && paging == .loading {
                    PurchasesArchiveSkeleton(rows: 6)
                } else if months.isEmpty && paging == .end {
                    nothingInScope
                }
                ForEach(months) { month in
                    Section {
                        PurchaseRowsPanel(rows: month.purchases) { purchase in
                            NavigationLink {
                                PurchaseDetailSurface(
                                    detail: PurchaseDetailSurfaces.sample(for: purchase))
                            } label: {
                                PurchaseRowLabel(
                                    purchase: purchase,
                                    badge: PurchasesArchive.showsBadge(purchase, in: scope))
                            }
                            .buttonStyle(.plain)
                        }
                    } header: {
                        header(month)
                    }
                }
                if !loaded.isEmpty && !(months.isEmpty && paging == .end) { footer }
            }
            .inventoryMotion(value: scope)
            .inventoryMotion(value: paging)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xl)
        }
        .background(Color.popsBackground)
        .navigationTitle(scope == .all ? "All purchases" : "Unmatched")
        .playgroundTitleDisplay(large: false)
        .toolbar {
            ToolbarItem(placement: .principal) { scopePicker }
        }
    }

    /// In the bar rather than above the list, so it does not scroll away from
    /// the rows it is filtering.
    private var scopePicker: some View {
        Picker("Show", selection: $scope) {
            ForEach(ArchiveScope.allCases, id: \.self) { scope in
                Text(scope.title).tag(scope)
            }
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }

    private func header(_ month: ArchiveMonth) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(PurchasesPresentation.month(month.month).uppercased())
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: PopsSpacing.sm)
            Text(total(month))
                .font(.popsCaption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
        }
        .padding(.horizontal, PopsSpacing.md)
        .padding(.vertical, PopsSpacing.sm)
        .playgroundGlass(in: Capsule())
    }

    /// Every currency the month holds, side by side and never added together.
    private func total(_ month: ArchiveMonth) -> String {
        let figures = PurchasesPresentation.totals(month.purchases).map { $0.formatted() }
        let joined = figures.joined(separator: " and ")
        return month.isIncomplete ? "\(joined) so far" : joined
    }

    private var nothingInScope: some View {
        Group {
            if scope == .all {
                ContentUnavailableView(
                    "No purchases", systemImage: "receipt",
                    description: Text("Receipts you capture land here."))
            } else {
                ContentUnavailableView {
                    Label {
                        Text("Nothing unmatched")
                    } icon: {
                        Image(systemName: "checkmark.seal")
                            .foregroundStyle(Color.popsSuccess)
                    }
                } description: {
                    Text("Every purchase is matched in finance.")
                }
            }
        }
        .containerRelativeFrame(.vertical, alignment: .center) { length, _ in length * 0.8 }
        .transition(.opacity)
    }

    @ViewBuilder private var footer: some View {
        switch paging {
        case .loading:
            PurchasesArchiveSkeleton(rows: 2)
                .accessibilityLabel("Loading earlier purchases")
        case .failed:
            VStack(spacing: PopsSpacing.sm) {
                Label(
                    "Couldn't load earlier purchases",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsDestructive)
                Button("Try again") { paging = .loading }
                    .font(.popsHeadline)
                    .playgroundGlassButton()
                    .tint(.popsPurchases)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.md)
            .transition(.opacity)
        case .end:
            if let oldest = PurchasesPresentation.byMonth(loaded).last?.month {
                Text("Everything since \(PurchasesPresentation.month(oldest))")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PopsSpacing.md)
            }
        }
    }
}

/// Rows of the archive before they arrive: a month header and its rows as
/// blank shapes, shimmering. Stands in for the first page and, shorter, for
/// the next one at the bottom of the list.
internal struct PurchasesArchiveSkeleton: View {
    internal let rows: Int
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget
    @ScaledMetric(relativeTo: .body) private var headerHeight = PopsSize.touchTarget * 0.75

    internal var body: some View {
        VStack(spacing: PopsSpacing.sm) {
            if rows > 2 {
                Capsule().fill(Color.popsSurface).frame(height: headerHeight)
            }
            ForEach(0..<rows, id: \.self) { _ in
                RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                    .fill(Color.popsSurface)
                    .frame(height: rowHeight)
            }
        }
        .popsShimmer()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading purchases")
        .transition(.opacity)
    }
}
