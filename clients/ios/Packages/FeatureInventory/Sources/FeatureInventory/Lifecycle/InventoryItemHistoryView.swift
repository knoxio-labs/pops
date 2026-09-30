import AppCore
import DesignSystem
import SwiftUI

/// Identifies the item whose complete event history is being shown.
internal struct InventoryItemHistoryRoute: Hashable {
    internal let itemId: InventoryItem.ID
}

/// A filtered event history over an item's events or the whole replica's recent activity.
internal struct InventoryItemHistoryView: View {
    internal let title: String
    internal let name: String
    @State private var model: InventoryRecentActivityModel
    @State private var viewing: InventoryActivityEntry?
    @State private var generation = 0
    @ScaledMetric(relativeTo: .body) private var circleSize = PopsSize.touchTarget

    internal init(
        title: String = "History", name: String, model: InventoryRecentActivityModel
    ) {
        self.title = title
        self.name = name
        _model = State(initialValue: model)
    }

    internal var body: some View {
        Group {
            if model.activity.phase == .unavailable {
                InventoryUnavailableView { generation += 1 }
            } else {
                content
            }
        }
        .task(id: HistoryTaskKey(kind: model.kind, generation: generation)) {
            await model.observe()
        }
    }

    private struct HistoryTaskKey: Equatable {
        let kind: InventoryHistoryKind?
        let generation: Int
    }

    private var content: some View {
        @Bindable var model = model
        return ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    PopsPageTitle(title: title) { filterMenu($model.kind) }
                    Text(name)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if model.isLoading {
                    PopsListSkeleton(rows: 8)
                } else {
                    months
                    pagingFooter
                }
            }
            .popsMotion(value: model.kind)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .popsCollapsingTitle(title)
        .background(Color.popsBackground)
        .tint(.popsInventory)
        .sheet(item: $viewing) { entry in
            InventoryHistoryEventSheet(entry: entry) { Task { await model.undo(entry) } }
        }
    }

    private var months: some View {
        let groups = InventoryHistoryMonth.group(model.entries)
        return Group {
            if groups.isEmpty {
                PopsCentredLine(
                    text: model.kind.map { "No \($0.title.lowercased())" } ?? "No history")
            } else {
                ForEach(groups) { month in
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        PopsSectionHeader(
                            title: month.title, trailing: "\(month.entries.count)")
                        InventorySelectionPanel(rows: month.entries) { entry in
                            Button {
                                viewing = entry
                            } label: {
                                InventoryHistoryLine(entry: entry)
                            }
                            .buttonStyle(.plain)
                            .onAppear {
                                if entry.seq == model.entries.last?.seq {
                                    Task { await model.loadNextPage() }
                                }
                            }
                        }
                    }
                    .transition(.opacity)
                }
            }
        }
    }

    @ViewBuilder private var pagingFooter: some View {
        if model.canLoadMore {
            if model.nextPageFailed {
                Button("Retry loading more") { Task { await model.retryNextPage() } }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PopsSpacing.md)
            } else if model.isLoadingNextPage {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PopsSpacing.md)
            }
        }
    }

    private func filterMenu(_ selection: Binding<InventoryHistoryKind?>) -> some View {
        Menu {
            Picker("Show", selection: selection) {
                Text("Everything").tag(InventoryHistoryKind?.none)
                ForEach(InventoryHistoryKind.allCases) { kind in
                    Label {
                        Text(kind.title)
                    } icon: {
                        kind.symbol.image
                    }
                    .tag(InventoryHistoryKind?.some(kind))
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease")
                .font(.popsBody.weight(.semibold))
                .foregroundStyle(
                    selection.wrappedValue == nil ? Color.popsInventory : Color.popsBackground
                )
                .frame(width: circleSize, height: circleSize)
                .background {
                    if selection.wrappedValue != nil { Circle().fill(Color.popsInventory) }
                }
                .popsGlass(in: Circle())
                .contentShape(Circle())
                .popsMotion(value: selection.wrappedValue)
        }
        .accessibilityLabel("Filter")
        .accessibilityValue(selection.wrappedValue?.title ?? "Everything")
    }
}

/// One month's run of the History page, in the order the events arrive.
internal struct InventoryHistoryMonth: Identifiable, Equatable {
    internal let title: String
    internal let entries: [InventoryActivityEntry]

    internal var id: String { title }

    internal static func group(_ entries: [InventoryActivityEntry]) -> [InventoryHistoryMonth] {
        var order: [String] = []
        var grouped: [String: [InventoryActivityEntry]] = [:]
        for entry in entries {
            if grouped[entry.month] == nil { order.append(entry.month) }
            grouped[entry.month, default: []].append(entry)
        }
        return order.map { InventoryHistoryMonth(title: $0, entries: grouped[$0] ?? []) }
    }
}
