import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanStopStrip: View {
    internal let snapshot: TripSnapshot

    internal var body: some View {
        if !snapshot.visits.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                HStack(alignment: .firstTextBaseline) {
                    Text("The route").font(.popsTitle)
                    Spacer()
                    Text("\(snapshot.visits.count) stops").font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                ScrollView(.horizontal) {
                    HStack(spacing: PopsSpacing.sm) {
                        ForEach(Array(snapshot.visits.enumerated()), id: \.element.id) {
                            index, visit in
                            stop(visit, index: index)
                        }
                    }
                    .padding(.vertical, PopsSpacing.xs)
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private func stop(_ visit: TripVisit, index: Int) -> some View {
        let place = snapshot.places.first { $0.id == visit.placeId }
        let dates = [visit.timing.arrival, visit.timing.departure]
            .compactMap { $0 }
            .map(TripClock.dayLabel)
            .joined(separator: " – ")
        let duration = visit.timing.duration.flatMap(tripVisitDurationLabel)

        return VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.xs) {
                Circle().fill(Color.popsAccent).frame(width: 7, height: 7)
                Text("STOP \(index + 1)").font(.popsSectionLabel)
                    .foregroundStyle(Color.popsAccent)
            }
            Text(place?.name ?? "Place unavailable").font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(2)
            Text(dates.isEmpty ? "Dates open" : dates).font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            if let duration {
                Text(duration).font(.popsCaption).foregroundStyle(Color.popsSuccess)
            }
        }
        .frame(width: 180, alignment: .leading)
        .padding(PopsSpacing.md)
        .background {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .fill(
                    LinearGradient(
                        colors: [Color.popsAccent.opacity(0.14), Color.popsSurface],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
        }
        .overlay {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsAccent.opacity(0.24), lineWidth: PopsBorder.hairline)
        }
        .accessibilityElement(children: .combine)
    }
}
