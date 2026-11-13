import DesignSystem
import SwiftUI

internal struct TripsChapterRail: View {
    internal let chapters: [TripOverviewChapter]
    internal let onSelectVisit: (Int) -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    internal var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    ForEach(chapters) { chapter($0) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: PopsSpacing.sm) {
                        ForEach(chapters) { chapter($0) }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Color.popsBackground)
    }

    private func chapter(_ chapter: TripOverviewChapter) -> some View {
        Button {
            onSelectVisit(chapter.id)
        } label: {
            PopsCard(appearance: .featured) {
                VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                    if chapter.isCurrent {
                        Text("Now")
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsTrips)
                    }
                    Text(chapter.title)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(chapter.timing)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Capsule()
                        .strokeBorder(
                            Color.popsTrips,
                            style: StrokeStyle(
                                lineWidth: PopsBorder.emphasis,
                                dash: chapter.hasOpenDates ? [PopsSpacing.xs, PopsSpacing.xs] : []
                            )
                        )
                        .frame(height: PopsSpacing.xs)
                        .accessibilityHidden(true)
                }
                .lineLimit(nil)
                .frame(
                    maxWidth: typeSize.isAccessibilitySize ? .infinity : nil,
                    minHeight: PopsSize.touchTarget, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .accessibilityHint("Show this visit in the timeline")
    }
}
