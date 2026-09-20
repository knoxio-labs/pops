import AppCore
import DesignSystem
import SwiftUI

/// Sync and repair: the counts, then what needs attention with each row's
/// one fix, then what is waiting to sync, then the last few resolved.
///
/// Reads and writes through `InventoryStore` only, over `InventorySyncViewModel`
/// — the same shape `InventoryDashboardView`/`InventoryDashboardViewModel`
/// use, so a first-launch "Download" here and the dashboard's own first-run
/// panel can never disagree about what state the replica is in.
internal struct InventorySyncView: View {
    /// Owned in `@State`, like the container and location pages: the
    /// destination builds a new model on every re-render, and a view that only
    /// borrowed it showed that new, never-observed model while `.task` kept
    /// following the first one, so the page never left its skeleton.
    @State private var model: InventorySyncViewModel
    @State private var generation = 0
    @State private var showsResolved = false

    internal init(model: InventorySyncViewModel) {
        _model = State(initialValue: model)
    }

    internal var body: some View {
        @Bindable var model = model
        return Group {
            switch model.phase {
            case .loading:
                InventorySyncSkeleton()
            case .unavailable:
                ErrorStateView(message: InventoryCopy.unavailable) { generation += 1 }
            case .loaded(let page):
                loaded(page)
            }
        }
        .task(id: generation) { await model.observe() }
        .navigationTitle("Sync")
        .inventoryTitleDisplay(large: true)
        .background(Color.popsBackground)
        .tint(.popsInventory)
        .inventoryUndoCapsule($model.undoOffer) { offer in
            Task { await model.undo(offer) }
        }
        .alert(
            InventoryCopy.failureTitle,
            isPresented: Binding(
                get: { model.failure != nil }, set: { if !$0 { model.failure = nil } }),
            presenting: model.failure
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { failure in
            Text(InventoryCopy.message(for: failure))
        }
        .inventoryStorageFullAlert(isPresented: $model.storageFull)
    }

    @ViewBuilder private func loaded(_ page: InventorySyncPage) -> some View {
        switch page.status {
        case .empty:
            InventorySyncFirstLaunch { Task { await model.download() } }
        case .downloading(let progress):
            InventorySyncDownloading(progress: progress)
        default:
            content(page)
        }
    }

    private func content(_ page: InventorySyncPage) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                header(page)
                InventoryCountTiles(tiles: tiles(page))
                if !page.repairRows.isEmpty { needsAttention(page) }
                if !page.waitingRows.isEmpty { waiting(page) }
                if !page.resolvedRows.isEmpty { resolved(page) }
            }
            .inventoryMotion(value: page)
            .inventoryMotion(value: showsResolved)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .background(Color.popsBackground)
        .refreshable { await model.refresh() }
    }

    private func header(_ page: InventorySyncPage) -> some View {
        Label {
            Text(statusLine(page))
                .foregroundStyle(Color.popsMutedForeground)
                .contentTransition(.numericText())
        } icon: {
            statusSymbol(page).image
                .foregroundStyle(Color.popsMutedForeground)
        }
        .font(.popsSubheadline)
        .accessibilityElement(children: .combine)
    }

    private func statusLine(_ page: InventorySyncPage) -> String {
        switch InventorySyncHeaderStatus.derive(page: page) {
        case .online(let since):
            since.map { "Synced \(InventoryRelativeTime.text($0))" } ?? "Synced"
        case .offline(let since):
            since.map { "Offline · synced \(InventoryRelativeTime.text($0))" } ?? "Offline"
        case .syncing(let count):
            "Syncing \(count) \(count == 1 ? "change" : "changes")"
        }
    }

    private func statusSymbol(_ page: InventorySyncPage) -> InventorySymbol {
        switch InventorySyncHeaderStatus.derive(page: page) {
        case .online: .synced
        case .offline: .stale
        case .syncing: .queued
        }
    }

    private func tiles(_ page: InventorySyncPage) -> [InventoryCountTile] {
        [
            InventoryCountTile(
                title: "Waiting", count: page.waitingRows.count,
                symbol: InventorySymbol.queued.system
            ),
            InventoryCountTile(
                title: "Needs attention", count: page.repairRows.count,
                symbol: InventorySymbol.attention.system),
            InventoryCountTile(
                title: "Resolved today", count: page.resolvedToday,
                symbol: InventorySymbol.resolved.system),
        ]
    }

    private func needsAttention(_ page: InventorySyncPage) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryGroundedSectionHeader(
                title: "Needs attention", status: "\(page.repairRows.count)")
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(page.repairRows) { row in
                        NavigationLink(value: InventoryRoute.repair(row.repair.id)) {
                            InventorySyncRepairRowView(
                                row: row, loadPhoto: { await model.thumbnail($0) },
                                onFix: { Task { await model.resolveInline(row.repair) } })
                        }
                        .buttonStyle(.plain)
                        if row.id != page.repairRows.last?.id {
                            PopsDivider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                        }
                    }
                }
            }
        }
        .transition(.opacity)
    }

    private func waiting(_ page: InventorySyncPage) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryGroundedSectionHeader(
                title: "Waiting to sync", status: "\(page.waitingRows.count)")
            InventoryGroundedListPanel {
                VStack(spacing: PopsSpacing.zero) {
                    ForEach(page.waitingRows) { row in
                        InventorySyncWaitingRowView(
                            row: row, loadPhoto: { await model.thumbnail($0) })
                        if row.id != page.waitingRows.last?.id {
                            PopsDivider().padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                        }
                    }
                }
            }
        }
    }

    private func resolved(_ page: InventorySyncPage) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Button {
                showsResolved.toggle()
            } label: {
                HStack(spacing: PopsSpacing.sm) {
                    InventoryGroundedSectionHeader(
                        title: "Resolved", status: "\(page.resolvedRows.count)")
                    Image(systemName: "chevron.forward")
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsMutedForeground)
                        .rotationEffect(.degrees(showsResolved ? 90 : 0))
                        .padding(.trailing, PopsSpacing.md)
                }
                .frame(minHeight: PopsSize.touchTarget)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityValue(showsResolved ? "Expanded" : "Collapsed")
            if showsResolved {
                InventoryGroundedListPanel {
                    VStack(spacing: PopsSpacing.zero) {
                        ForEach(page.resolvedRows.prefix(Self.resolvedShown)) { row in
                            InventorySyncResolvedRowView(
                                row: row, loadPhoto: { await model.thumbnail($0) })
                            if row.id != page.resolvedRows.prefix(Self.resolvedShown).last?.id {
                                PopsDivider().padding(
                                    .leading, PopsSize.touchTarget + PopsSpacing.md)
                            }
                        }
                    }
                }
                .transition(.opacity)
            }
        }
    }

    private static let resolvedShown = 3
}
