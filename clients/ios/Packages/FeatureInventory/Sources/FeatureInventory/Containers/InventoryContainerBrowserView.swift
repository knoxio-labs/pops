import DesignSystem
import SwiftUI

/// Every container: the counts, the search with its filter and add circles,
/// the open ones in the dashboard's panel, then the rest, narrowed by
/// whatever the search bar's filter and query say.
///
/// The add circle opens the shared item form, the same one New item opens
/// from the Items browser: a container is an item, and the form is where its
/// type is chosen.
internal struct InventoryContainerBrowserView: View {
    @State private var model: InventoryContainerBrowserModel
    @State private var generation = 0
    @Namespace private var rowSpace
    @Environment(\.inventoryItemForm) private var itemForm

    internal init(model: InventoryContainerBrowserModel) {
        _model = State(initialValue: model)
    }

    internal var body: some View {
        Group {
            switch model.containers.phase {
            case .loading: InventoryContainerBrowserSkeleton()
            case .unavailable: InventoryUnavailableView { generation += 1 }
            case .loaded(let profiles): content(profiles)
            }
        }
        .task(id: generation) { await model.containers.observe() }
        .inventoryRunnerChrome(model.runner)
    }

    private func content(_ profiles: [InventoryContainerProfile]) -> some View {
        let filterMatched = model.filterMatched(profiles)
        let shown = model.shown(profiles)
        return ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                PopsPageTitle(title: "Containers")
                if profiles.isEmpty {
                    ContentUnavailableView("No containers", systemImage: "shippingbox")
                } else {
                    InventoryCountTiles(tiles: InventoryContainerStats(profiles).tiles)
                    searchBar
                    if filterMatched.isEmpty {
                        filteredEmpty
                            .transition(.opacity)
                    } else if shown.isEmpty {
                        InventoryContainerCentredLine(
                            text: "No containers match \u{201C}\(model.query)\u{201D}"
                        )
                        .transition(.opacity)
                    } else {
                        lists(shown)
                    }
                }
            }
            .popsMotion(value: model.filter)
            .popsMotion(value: model.query)
            .popsMotion(PopsMotion.smooth, value: profiles.map(\.item.containment))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .popsCollapsingTitle("Containers")
        .inventoryGroundedSwipeActionsContainer()
        .background(Color.popsBackground)
        .tint(.popsInventory)
    }

    @ViewBuilder
    private func lists(_ shown: [InventoryContainerProfile]) -> some View {
        let open = shown.filter(\.isOpen)
        let rest = shown.filter { !$0.isOpen }
        if !open.isEmpty {
            InventoryOpenContainersPanel(containers: open, rowSpace: rowSpace) { container in
                Task { await model.close(container) }
            }
            .transition(PopsMotion.row)
        }
        if !rest.isEmpty {
            restList(rest)
                .transition(PopsMotion.row)
        }
    }

    private var searchBar: some View {
        @Bindable var model = model
        return InventorySearchBar(
            query: $model.query,
            prompt: "Search containers",
            isFiltered: model.filter != .all,
            filterSummary: model.filter == .all ? "" : model.filter.title,
            add: InventorySearchBarAdd(label: "New container") {
                itemForm?(.create(placement: nil))
            }
        ) {
            Picker("Filter", selection: $model.filter) {
                ForEach(InventoryContainerFilter.allCases) { option in
                    Text(option.title).tag(option)
                }
            }
        }
    }

    private func restList(_ rest: [InventoryContainerProfile]) -> some View {
        InventoryGroundedListPanel {
            VStack(spacing: PopsSpacing.zero) {
                ForEach(rest) { profile in
                    NavigationLink(value: InventoryRoute.container(profile.id)) {
                        InventoryContainerRowLabel(profile: profile)
                    }
                    .buttonStyle(.plain)
                    .matchedGeometryEffect(id: profile.id, in: rowSpace)
                    .transition(PopsMotion.row)
                    if profile.id != rest.last?.id {
                        PopsDivider()
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
        }
    }

    private var filteredEmpty: some View {
        ContentUnavailableView {
            Label("No \(model.filter.title.lowercased()) containers", systemImage: "shippingbox")
        } actions: {
            Button("Show all") { model.filter = .all }
                .inventoryGlassButton()
        }
    }
}

/// The one line a filtered-out list shows, centred under the search bar.
private struct InventoryContainerCentredLine: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.popsBody)
            .foregroundStyle(Color.popsMutedForeground)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, PopsSpacing.xl)
            .transition(.opacity)
    }
}

/// The browser before its records arrive.
internal struct InventoryContainerBrowserSkeleton: View {
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryCountTilesSkeleton(count: 4)
                Capsule().fill(Color.popsSurface).frame(height: rowHeight)
                VStack(spacing: PopsSpacing.sm) {
                    ForEach(0..<8, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                            .fill(Color.popsSurface)
                            .frame(height: rowHeight)
                    }
                }
            }
            .popsShimmer()
            .padding(.horizontal, PopsSpacing.lg)
        }
        .scrollDisabled(true)
        .background(Color.popsBackground)
        .navigationTitle("Containers")
        .popsTitleDisplay(large: true)
        .accessibilityLabel("Loading")
    }
}
