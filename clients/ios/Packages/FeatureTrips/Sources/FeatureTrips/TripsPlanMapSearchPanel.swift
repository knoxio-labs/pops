import DesignSystem
import MapKit
import SwiftUI

internal struct TripsPlanMapSearchPanel: View {
    @Binding internal var searchText: String
    internal let results: [MKMapItem]
    internal let isSearching: Bool
    internal let search: () -> Void
    internal let choose: (MKMapItem) -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            HStack(spacing: PopsSpacing.sm) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)
                TextField("Search Apple Maps", text: $searchText)
                    .textContentType(.location)
                    .submitLabel(.search)
                    .onSubmit(search)
                    .accessibilityIdentifier("trip-map-search")
                Button(action: search) {
                    if isSearching {
                        ProgressView()
                    } else {
                        Text("Search")
                    }
                }
                .disabled(
                    searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || isSearching
                )
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                .accessibilityIdentifier("trip-map-search-button")
            }
            .padding(.horizontal, PopsSpacing.md)
            .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.control))
            if !results.isEmpty { searchResults }
        }
    }

    private var searchResults: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.sm) {
                ForEach(Array(results.enumerated()), id: \.offset) { _, item in
                    Button {
                        choose(item)
                    } label: {
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(item.name ?? "Map result")
                                .font(.popsSubheadline)
                                .lineLimit(1)
                            if let address = tripMapItemAddress(item) {
                                Text(address)
                                    .font(.popsCaption)
                                    .foregroundStyle(Color.popsMutedForeground)
                                    .lineLimit(1)
                            }
                        }
                        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                        .padding(.horizontal, PopsSpacing.md)
                        .background(
                            Color.popsSurface,
                            in: RoundedRectangle(cornerRadius: PopsRadius.control))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .scrollIndicators(.hidden)
        .accessibilityLabel("Apple Maps search results")
    }
}
