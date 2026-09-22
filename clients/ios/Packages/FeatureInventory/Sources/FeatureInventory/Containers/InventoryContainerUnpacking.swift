import AppCore
import DesignSystem
import SwiftUI

/// The two answers to a container that has just been emptied.
internal enum InventoryEmptiedContainerChoice: String, CaseIterable, Identifiable {
    case keep
    case retire

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .keep: "Keep"
        case .retire: "Retire"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .keep: .storeHere
        case .retire: .retired
        }
    }
}

/// Shown in place of the contents once the last thing has left: the box's
/// photo and two equal choices. Nothing blocks on it.
internal struct InventoryContainerEmptiedCard: View {
    internal let profile: InventoryContainerProfile
    internal let load: @MainActor (String) async -> Data?
    internal let onChoose: (InventoryEmptiedContainerChoice) -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(spacing: PopsSpacing.md) {
                InventoryRecordMark(
                    photo: profile.item.photos.first?.sha256,
                    symbol: .record(access: profile.item.containment?.access), load: load)
                Text("\(profile.name) is empty")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: PopsSpacing.zero)
            }
            InventoryGlassGroup(spacing: PopsSpacing.sm) {
                HStack(spacing: PopsSpacing.sm) {
                    ForEach(InventoryEmptiedContainerChoice.allCases) { choice in
                        Button {
                            onChoose(choice)
                        } label: {
                            Label {
                                Text(choice.title)
                            } icon: {
                                choice.symbol.image
                            }
                            .font(.popsHeadline)
                            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                        }
                        .inventoryGlassButton()
                    }
                }
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .transition(PopsMotion.row)
    }
}

/// The contents' search: the shared Mail-style bar, its filter narrowing by
/// type and by how recently something went in.
internal struct InventoryContainerSearchBar: View {
    @Binding internal var query: String
    @Binding internal var filter: InventoryContainerContentsFilter
    internal let types: [String]

    internal var body: some View {
        InventorySearchBar(query: $query, isFiltered: filter.isActive, filterSummary: summary) {
            Picker(selection: $filter.type) {
                Text("Any type").tag(String?.none)
                ForEach(types, id: \.self) { type in
                    Text(type).tag(String?.some(type))
                }
            } label: {
                Label {
                    Text("Type")
                } icon: {
                    InventorySymbol.label.image
                }
            }
            .pickerStyle(.menu)
            Toggle(isOn: $filter.recentOnly) {
                Label("Recently added", systemImage: "clock")
            }
            if filter.isActive {
                Divider()
                Button("Clear filters") {
                    filter = InventoryContainerContentsFilter()
                }
            }
        }
        .padding(.horizontal, PopsSpacing.lg)
    }

    private var summary: String {
        [filter.type, filter.recentOnly ? "Recently added" : nil].compactMap(\.self)
            .joined(separator: ", ")
    }
}
