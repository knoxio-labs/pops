import AppCore
import DesignSystem
import SwiftUI

internal struct PurchasesHomeScreen: View {
    @State private var model: PurchasesHomeModel
    @State private var list: PurchasesHomeList = .recent
    @Environment(\.purchaseCapture) private var purchaseCapture
    @Environment(\.startRePairing) private var startRePairing

    internal init(dependencies: AppDependencies) {
        _model = State(wrappedValue: PurchasesHomeModel(dependencies: dependencies))
    }

    internal var body: some View {
        Group {
            switch model.phase {
            case .loading:
                PurchasesHomeSkeleton()
                    .transition(.opacity)
            case .failed(let failure):
                PurchasesHomeFailureView(failure: failure, onAction: act)
                    .transition(.opacity)
            case .loaded(let digest, let refresh):
                if digest.allCount == 0 {
                    PurchasesHomeEmptyView(onScan: scanAction)
                        .transition(.opacity)
                } else {
                    content(digest, refresh: refresh)
                        .transition(.opacity)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom, alignment: .trailing) {
            if case .loaded = model.phase, let purchaseCapture {
                PurchasesCaptureControls(presenter: purchaseCapture)
            }
        }
        .navigationTitle(FeaturePurchases.displayName)
        .task { await model.load() }
        .accessibilityIdentifier(PurchasesAccessibility.homeRoot)
    }

    private func content(_ digest: PurchasesHomeDigest, refresh: PurchasesHomeRefresh) -> some View
    {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                PurchasesHomeFigure(digest: digest, refresh: refresh) {
                    Task { await model.refresh() }
                }
                PurchasesHomeTiles(digest: digest)
                lists(digest)
            }
            .popsMotion(value: digest.purchases.map(\.id))
            .popsMotion(value: list)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.lg)
        }
        .scrollBounceBehavior(.basedOnSize)
        .refreshable { await model.refresh() }
    }

    private func lists(_ digest: PurchasesHomeDigest) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Picker("Show", selection: $list) {
                ForEach(PurchasesHomeList.allCases) { list in
                    Text(list.title).tag(list)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityIdentifier(PurchasesAccessibility.listPicker)
            switch list {
            case .recent:
                recent(digest.recent)
                    .transition(.opacity)
            case .leaders:
                leaders(digest.leaders)
                    .transition(.opacity)
            }
        }
    }

    private func recent(_ purchases: [Purchase]) -> some View {
        PurchaseRowsPanel(rows: purchases) { purchase in
            let highlighted = model.highlighted.contains(purchase.id)
            NavigationLink(value: PurchasesScreenRoute.detail(purchase.id)) {
                PurchaseRowLabel(
                    content: highlighted
                        ? PurchaseRowContent(
                            mark: purchase,
                            title: PurchasesPresentation.merchant(purchase),
                            detail: "\(PurchasesPresentation.day(purchase)) · Just saved",
                            amount: purchase.total)
                        : PurchaseRowContent(purchase: purchase))
            }
            .buttonStyle(.plain)
            .background {
                RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                    .fill(Color.popsPurchases.opacity(highlighted ? 0.16 : 0))
                    .padding(.horizontal, -PopsSpacing.sm)
            }
            .accessibilityIdentifier(
                highlighted
                    ? PurchasesAccessibility.highlightedRow(purchase.id)
                    : PurchasesAccessibility.row(purchase.id))
        }
    }

    @ViewBuilder private func leaders(_ leaders: [PurchasesHomeDigest.Leader]) -> some View {
        if leaders.isEmpty {
            Text("No merchant recognised this month")
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
                .frame(maxWidth: .infinity)
                .padding(PopsSpacing.lg)
                .popsPanelGround()
        } else {
            PurchaseRowsPanel(rows: leaders) { leader in
                PurchasesLeaderRow(leader: leader)
            }
        }
    }

    private var scanAction: (() -> Void)? {
        guard let purchaseCapture else { return nil }
        return { purchaseCapture(.scan) }
    }

    private func act(_ action: PurchasesHomeFailureAction) {
        switch action {
        case .retry:
            Task { await model.load() }
        case .pair:
            startRePairing()
        }
    }
}

internal enum PurchasesHomeList: String, CaseIterable, Identifiable {
    case recent
    case leaders

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .recent: "Recent"
        case .leaders: "Where it went"
        }
    }
}

private struct PurchasesLeaderRow: View {
    let leader: PurchasesHomeDigest.Leader

    var body: some View {
        HStack(spacing: PopsSpacing.md) {
            PurchasesTileSymbol(symbol: "storefront")
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(leader.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(2)
                Text(PurchasesHomeCopy.count(leader.purchases, currencies: 1))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(leader.total.formatted())
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }
}
