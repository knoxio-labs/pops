import AppCore
import DesignSystem
import SwiftUI

/// What an Item detail page pushes to see every event on the item.
internal struct InventoryItemHistoryRoute: Hashable {
    internal let itemId: InventoryItem.ID
}

/// One item's full history, newest first, one line per event under a month
/// heading, narrowed by kind from the filter circle beside the title. A line
/// opens its account as a sheet, and the account offers Undo while the event
/// is still undoable.
///
/// Recent activity is the same page over every record's events, under its
/// own `title`, with each line naming the record it is about.
internal struct InventoryItemHistoryView: View {
    internal let title: String
    internal let name: String
    internal let entries: [InventoryActivityEntry]
    internal let isLoading: Bool
    internal let onUndo: (InventoryActivityEntry) -> Void
    @State private var kind: InventoryHistoryKind?
    @State private var viewing: InventoryActivityEntry?
    @ScaledMetric(relativeTo: .body) private var circleSize = PopsSize.touchTarget

    internal init(
        title: String = "History",
        name: String,
        entries: [InventoryActivityEntry],
        isLoading: Bool = false,
        viewing: InventoryActivityEntry? = nil,
        onUndo: @escaping (InventoryActivityEntry) -> Void
    ) {
        self.title = title
        self.name = name
        self.entries = entries
        self.isLoading = isLoading
        self.onUndo = onUndo
        _viewing = State(initialValue: viewing)
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryPageTitle(title: title) { filterMenu }
                    Text(name)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if isLoading {
                    InventoryLocationListSkeleton(rows: 8)
                } else {
                    months
                }
            }
            .inventoryMotion(value: kind)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .inventoryCollapsingTitle(title)
        .background(Color.popsBackground)
        .tint(.popsInventory)
        .sheet(item: $viewing) { entry in
            InventoryHistoryEventSheet(entry: entry) { onUndo(entry) }
        }
    }

    private var shown: [InventoryActivityEntry] {
        guard let kind else { return entries }
        return entries.filter { $0.kind == kind }
    }

    @ViewBuilder private var months: some View {
        let groups = InventoryHistoryMonth.group(shown)
        if groups.isEmpty {
            InventoryCentredLine(text: kind.map { "No \($0.title.lowercased())" } ?? "No history")
        } else {
            ForEach(groups) { month in
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    InventoryLocationSectionHeader(
                        title: month.title, trailing: "\(month.entries.count)")
                    InventoryLocationPanel(rows: month.entries) { entry in
                        Button {
                            viewing = entry
                        } label: {
                            InventoryHistoryLine(entry: entry)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .transition(.opacity)
            }
        }
    }

    private var filterMenu: some View {
        Menu {
            Picker("Show", selection: $kind) {
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
                .foregroundStyle(kind == nil ? Color.popsInventory : Color.popsBackground)
                .frame(width: circleSize, height: circleSize)
                .background {
                    if kind != nil { Circle().fill(Color.popsInventory) }
                }
                .inventoryGlass(in: Circle())
                .contentShape(Circle())
                .inventoryMotion(value: kind)
        }
        .accessibilityLabel("Filter")
        .accessibilityValue(kind?.title ?? "Everything")
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
