import AppCore
import DesignSystem
import SwiftUI

internal struct PurchasesArchiveScreen: View {
    @State private var model: PurchasesArchiveViewModel

    internal init(scope: PurchasesArchiveScope, dependencies: AppDependencies) {
        _model = State(
            wrappedValue: PurchasesArchiveViewModel(
                dependencies: dependencies, initialScope: scope))
    }

    internal var body: some View {
        Group {
            switch model.topLevelState {
            case .loading:
                PopsListSkeleton(rows: 6)
                    .padding(.horizontal, PopsSpacing.lg)
            case .failed(let error):
                firstPageFailure(error)
            case .loaded:
                if model.purchases.isEmpty { nothingInScope } else { archive }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .navigationTitle(model.scope == .all ? "All purchases" : "Unmatched")
        .popsTitleDisplay(large: false)
        .toolbar { ToolbarItem(placement: .principal) { scopePicker } }
        .task { await model.loadFirstPageIfNeeded() }
    }

    private var archive: some View {
        ScrollView {
            LazyVStack(
                alignment: .leading,
                spacing: PopsSpacing.lg,
                pinnedViews: [.sectionHeaders]
            ) {
                ForEach(model.months) { month in
                    Section {
                        PurchaseRowsPanel(rows: month.purchases) { purchase in
                            NavigationLink(value: PurchasesScreenRoute.detail(purchase.id)) {
                                PurchaseRowLabel(
                                    content: PurchaseRowContent(
                                        purchase: purchase,
                                        badge: PurchasesArchive.showsBadge(
                                            purchase, in: model.scope)))
                            }
                            .buttonStyle(.plain)
                        }
                    } header: {
                        header(month)
                    }
                }
                footer
            }
            .popsMotion(value: model.scope)
            .popsMotion(value: model.paging)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xl)
        }
    }

    private var scopePicker: some View {
        Picker(
            "Show",
            selection: Binding(
                get: { model.scope },
                set: { scope in Task { await model.setScope(scope) } })
        ) {
            ForEach(PurchasesArchiveScope.allCases, id: \.self) { scope in
                Text(scope.title).tag(scope)
            }
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }

    private func header(_ month: ArchiveMonth) -> some View {
        PopsSectionHeader(
            title: PurchasesPresentation.month(month.month).uppercased(),
            trailing: total(month)
        )
        .padding(.vertical, PopsSpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsBackground)
    }

    private func total(_ month: ArchiveMonth) -> String {
        let figures = PurchasesPresentation.totals(month.purchases).map { $0.formatted() }
        let joined = figures.joined(separator: " and ")
        return month.isIncomplete ? "\(joined) so far" : joined
    }

    private var nothingInScope: some View {
        Group {
            if model.scope == .all {
                ContentUnavailableView(
                    "No purchases",
                    systemImage: "receipt",
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
        .transition(.opacity)
    }

    private func firstPageFailure(_ error: RepositoryError) -> some View {
        ContentUnavailableView {
            Label("Couldn't load purchases", systemImage: "exclamationmark.icloud")
        } description: {
            Text(PurchasesHomeFailure(error).message)
        } actions: {
            Button("Retry") { Task { await model.loadFirstPageIfNeeded() } }
                .font(.popsHeadline)
                .foregroundStyle(Color.popsBackground)
                .popsProminentGlassButton()
                .tint(.popsPurchases)
        }
    }

    @ViewBuilder private var footer: some View {
        switch model.paging {
        case .loading:
            PopsListSkeleton(rows: 2)
                .accessibilityLabel("Loading earlier purchases")
                .task { await model.loadNextPageIfNeeded() }
        case .failed:
            VStack(spacing: PopsSpacing.sm) {
                Label(
                    "Couldn't load earlier purchases",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsDestructive)
                Button("Try again") { Task { await model.retryNextPage() } }
                    .font(.popsHeadline)
                    .padding(.horizontal, PopsSpacing.lg)
                    .padding(.vertical, PopsSpacing.sm)
                    .popsGlass(in: Capsule())
                    .tint(.popsPurchases)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.md)
            .transition(.opacity)
        case .end:
            if let oldest = model.months.last?.month {
                Text("Everything since \(PurchasesPresentation.month(oldest))")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PopsSpacing.md)
            }
        }
    }
}
