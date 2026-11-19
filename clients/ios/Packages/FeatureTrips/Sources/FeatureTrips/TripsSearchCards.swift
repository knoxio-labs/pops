import DesignSystem
import SwiftUI

internal struct TripsSearchCardContent {
    internal let title: String
    internal let category: String
    internal let detail: String?
    internal let symbol: String
    internal let accent: Color
}

internal struct TripsSearchWelcomeCard: View {
    internal let tripName: String?

    internal var body: some View {
        PopsCard(appearance: .featured) {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Image(systemName: "sparkle.magnifyingglass")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsTrips)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .background(
                        Color.popsTripsTint,
                        in: RoundedRectangle(cornerRadius: PopsRadius.control)
                    )
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text("Find your way back to it.")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Flights, stays, places and moments you saved for the journey.")
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let tripName {
                    Label(tripName, systemImage: "map")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsTrips)
                        .padding(.top, PopsSpacing.xs)
                }
            }
        }
    }
}

internal struct TripsSearchHints: View {
    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text("Start with a detail")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            Text("A city, flight number, booking code or a note you captured.")
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: PopsSpacing.sm) {
                Label("Flight", systemImage: "airplane")
                Label("Reference", systemImage: "number")
                Label("Place", systemImage: "mappin.and.ellipse")
            }
            .font(.popsCaption)
            .foregroundStyle(Color.popsTrips)
            .padding(.top, PopsSpacing.xs)
        }
        .padding(.horizontal, PopsSpacing.xs)
    }
}

internal struct TripsSearchResultHeading: View {
    internal let filter: TripsSearchFilter
    internal let hitCount: Int

    internal var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(filter == .all ? "Search results" : filter.title)
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Text(hitCount == 1 ? "1 detail found" : "\(hitCount) details found")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            if filter != .all {
                Text(filter.title)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsTrips)
                    .padding(.horizontal, PopsSpacing.md)
                    .padding(.vertical, PopsSpacing.xs)
                    .background(Color.popsTripsTint, in: Capsule())
            }
        }
        .accessibilityElement(children: .combine)
    }
}

internal struct TripsSearchFilterPicker: View {
    @Binding internal var filter: TripsSearchFilter

    internal var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.sm) {
                ForEach(TripsSearchFilter.allCases, id: \.self) { option in
                    Button {
                        filter = option
                    } label: {
                        Label(option.title, systemImage: option.symbol)
                            .font(.popsSubheadline)
                            .foregroundStyle(
                                filter == option ? Color.popsTrips : Color.popsForeground
                            )
                            .padding(.horizontal, PopsSpacing.md)
                            .frame(minHeight: PopsSize.touchTarget)
                            .background(
                                filter == option ? Color.popsTripsTint : Color.popsSurface,
                                in: Capsule()
                            )
                            .overlay {
                                Capsule()
                                    .stroke(
                                        filter == option ? Color.popsTrips : Color.popsSeparator,
                                        lineWidth: PopsBorder.hairline)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(filter == option ? .isSelected : [])
                }
            }
        }
        .scrollIndicators(.hidden)
    }
}

internal struct TripsSearchResultCard: View {
    internal let content: TripsSearchCardContent

    internal var body: some View {
        PopsCard(appearance: .featured) {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: content.symbol)
                    .font(.popsTitle)
                    .foregroundStyle(content.accent)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .background(
                        content.accent.opacity(0.14),
                        in: RoundedRectangle(cornerRadius: PopsRadius.control)
                    )
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(content.category)
                        .font(.popsCaption)
                        .foregroundStyle(content.accent)
                    Text(content.title)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    if let detail = content.detail, !detail.isEmpty {
                        Text(detail)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: PopsSpacing.zero)
                Image(systemName: "chevron.right")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        }
        .overlay(alignment: .leading) {
            Capsule()
                .fill(content.accent)
                .frame(width: PopsBorder.emphasis)
                .padding(.vertical, PopsSpacing.md)
                .accessibilityHidden(true)
        }
    }
}
