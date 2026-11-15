import DesignSystem
import SwiftUI

internal struct TripsNextSummaryContent: View {
    internal let summary: TripNextSummary
    @Environment(\.dynamicTypeSize) private var typeSize

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            if typeSize.isAccessibilitySize {
                Text("Next")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                ForEach(summary.timing.indices, id: \.self) { index in
                    Text(summary.timing[index])
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            } else {
                Text("Next · \(summary.when)")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Text(summary.title)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            if let state = summary.stateLine {
                Text(state)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if summary.hasConflictingTimes {
                Label("Recorded times conflict", systemImage: "exclamationmark.triangle")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsTripsAttention)
            }
        }
        .lineLimit(nil)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
