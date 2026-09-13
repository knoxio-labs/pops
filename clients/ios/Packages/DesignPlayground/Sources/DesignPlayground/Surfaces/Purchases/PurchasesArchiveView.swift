import AppCore
import DesignSystem
import SwiftUI

/// Every purchase, by month: what `All N purchases` opens, and what the
/// unmatched strip opens with the scope already set.
///
/// ## One screen, two ways in
///
/// The unmatched strip and `All N` lead to one list at two scopes, not to two
/// screens. `Inbox` was the unmatched purchases on a screen of their own, with
/// the two answers as buttons, and it was rejected because bfm proxies no
/// reconcile route: there is nothing for those buttons to do. A screen of
/// unmatched rows that cannot act on them is this list filtered, so that is
/// what it is. The day reconcile reaches the phone, the unmatched scope is
/// where its actions go.
///
/// ## It pages, and the bottom is where that is said
///
/// Loading, a failure with a retry, or the end. Only the failure is drawn as
/// an error, because it is the only one that is.
///
/// ## Ledger's structure, the digest's material
///
/// `Ledger` answered the archive well and lost the home because it said
/// nothing about the tab's other three jobs. This is that answer where it
/// belongs: one run, newest first, cut by month under a pinned header. The
/// headers and containers are glass so the push from the digest does not
/// arrive somewhere flatter than where it left.
internal struct PurchasesArchiveView: View {
    internal let loaded: [Purchase]

    @State private var paging: ArchivePaging
    @State private var scope: ArchiveScope

    private let markSize: CGFloat = 34

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
                if months.isEmpty { nothingInScope }
                ForEach(months) { month in
                    Section {
                        rows(month.purchases)
                    } header: {
                        header(month)
                    }
                }
                footer
            }
            .padding(PopsSpacing.lg)
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
            Spacer(minLength: PopsSpacing.sm)
            Text(total(month))
                .font(.popsCaption)
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

    private func rows(_ purchases: [Purchase]) -> some View {
        VStack(spacing: PopsSpacing.zero) {
            ForEach(purchases) { purchase in
                NavigationLink {
                    PurchaseDetailSurface(detail: PurchaseDetailSurfaces.sample(for: purchase))
                } label: {
                    row(purchase)
                }
                .buttonStyle(.plain)
                if purchase.id != purchases.last?.id {
                    PopsDivider()
                        .padding(.leading, markSize + PopsSpacing.md)
                }
            }
        }
        .padding(.horizontal, PopsSpacing.md)
        .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
    }

    private func row(_ purchase: Purchase) -> some View {
        HStack(spacing: PopsSpacing.md) {
            PurchaseMark(purchase: purchase, size: markSize)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(PurchasesPresentation.merchant(purchase))
                    .font(.popsSubheadline)
                    .foregroundStyle(
                        PurchasesPresentation.isUnattributed(purchase)
                            ? Color.popsMutedForeground : Color.popsForeground
                    )
                    .lineLimit(2)
                HStack(spacing: PopsSpacing.sm) {
                    Text(PurchasesPresentation.day(purchase))
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    if PurchasesArchive.showsBadge(purchase, in: scope) {
                        PurchaseStatusBadge(status: purchase.status)
                    }
                }
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(purchase.total.formatted())
                .font(.popsSubheadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.md)
        .contentShape(.rect)
    }

    private var nothingInScope: some View {
        Text(scope == .all ? "No purchases yet" : "Nothing unmatched")
            .font(.popsSubheadline)
            .foregroundStyle(Color.popsMutedForeground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.xl)
    }

    @ViewBuilder private var footer: some View {
        switch paging {
        case .loading:
            HStack(spacing: PopsSpacing.sm) {
                ProgressView()
                Text("Loading earlier purchases")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.md)
        case .failed:
            VStack(spacing: PopsSpacing.sm) {
                Label(
                    "Couldn't load earlier purchases",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.popsCaption)
                .foregroundStyle(Color.popsDestructive)
                Button("Try again") { paging = .loading }
                    .font(.popsSubheadline)
                    .playgroundGlassButton()
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.md)
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
