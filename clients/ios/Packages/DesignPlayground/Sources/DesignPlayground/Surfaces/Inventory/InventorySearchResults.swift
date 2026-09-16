import DesignSystem
import SwiftUI

internal struct InventorySearchResult: Identifiable, Equatable {
    internal let id: String
    internal let title: String
    internal let detail: String
    internal let symbol: String
    internal let route: InventoryRoute
}

internal struct InventorySearchResults: View {
    internal let fixture: InventoryDashboardFixture
    internal let query: String

    internal var body: some View {
        Group {
            if fixture.isFirstRun {
                ContentUnavailableView(
                    "Inventory is not on this phone",
                    systemImage: "shippingbox.and.arrow.backward",
                    description: Text("Start synchronization from the Inventory tab."))
            } else if query.isEmpty {
                List(recentResults) { result in
                    resultLink(result)
                }
                .playgroundInsetGroupedList()
            } else if matchingResults.isEmpty {
                ContentUnavailableView.search(text: query)
            } else {
                List(matchingResults) { result in
                    resultLink(result)
                }
                .playgroundInsetGroupedList()
            }
        }
        .navigationDestination(for: InventoryRoute.self) { route in
            InventoryDestinationView(route: route)
        }
    }

    internal var matchingResults: [InventorySearchResult] {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !search.isEmpty else { return recentResults }
        return allResults.filter { result in
            result.title.localizedCaseInsensitiveContains(search)
                || result.detail.localizedCaseInsensitiveContains(search)
        }
    }

    private var recentResults: [InventorySearchResult] {
        fixture.recentItems.map(itemResult)
    }

    private var allResults: [InventorySearchResult] {
        let items = uniqueItems.map(itemResult)
        let containers = fixture.containers.map { container in
            InventorySearchResult(
                id: "container-\(container.id)",
                title: container.name,
                detail: "Container · \(container.location)",
                symbol: "shippingbox",
                route: .container(container.id))
        }
        let locations = Set(fixture.containers.map(\.location)).sorted().map { location in
            InventorySearchResult(
                id: "location-\(location)",
                title: location,
                detail: "Location",
                symbol: "house",
                route: .locations)
        }
        return items + containers + locations
    }

    private var uniqueItems: [InventoryItem] {
        var seen = Set<String>()
        return (fixture.inHand + fixture.recentItems).filter { seen.insert($0.id).inserted }
    }

    private func itemResult(_ item: InventoryItem) -> InventorySearchResult {
        InventorySearchResult(
            id: "item-\(item.id)",
            title: item.name,
            detail: item.detail,
            symbol: item.symbol,
            route: .item(item.id))
    }

    private func resultLink(_ result: InventorySearchResult) -> some View {
        NavigationLink(value: result.route) {
            Label {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(result.title)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text(result.detail)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            } icon: {
                Image(systemName: result.symbol)
                    .foregroundStyle(Color.popsAccent)
                    .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
            }
        }
    }
}
