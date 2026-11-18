import AppCore
import DesignSystem
import SwiftUI

internal struct TripsJourneyDetailView: View {
    internal let journey: TripJourney
    internal let places: [TripPlace]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if journey.legs.isEmpty {
                ContentUnavailableView(
                    "No route segments recorded",
                    systemImage: "point.3.connected.trianglepath.dotted",
                    description: Text("Route details will appear here when they are added.")
                )
            } else {
                ForEach(Array(journey.legs.enumerated()), id: \.element.id) { index, leg in
                    legCard(leg, index: index)
                }
            }
            TripsSourceFactsCard(
                title: "Journey details", symbol: "ticket",
                facts: facts(reference: journey.reference, notes: journey.notes))
            TripsSourceReferencesCard(title: "Journey sources", links: journey.sourceLinks)
        }
    }

    private func legCard(_ leg: TripJourneyLeg, index: Int) -> some View {
        TripsSourceDetailCard(title: legTitle(leg, index: index), symbol: "arrow.right") {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                if let mode = leg.mode, !mode.isEmpty {
                    Text(mode)
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsAccent)
                        .padding(.horizontal, PopsSpacing.md)
                        .padding(.vertical, PopsSpacing.xs)
                        .background(Color.popsAccent.opacity(0.12), in: Capsule())
                }
                route(leg)
                if let operatorName = leg.operator, !operatorName.isEmpty {
                    TripsSourceFactLine(label: "Operator", value: operatorName)
                }
                if let reference = leg.reference, !reference.isEmpty {
                    TripsSourceFactLine(label: "Reference", value: reference, monospaced: true)
                }
                if !leg.notes.isEmpty {
                    TripsSourceFactLine(
                        label: "Notes", value: leg.notes)
                }
                TripsSourceReferencesCard(title: "Segment sources", links: leg.sourceLinks)
            }
        }
    }

    private func route(_ leg: TripJourneyLeg) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: PopsSpacing.md) {
                endpoint("From", leg.from)
                Image(systemName: "arrow.right")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsAccent)
                    .accessibilityHidden(true)
                endpoint("To", leg.to)
            }
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                endpoint("From", leg.from)
                Image(systemName: "arrow.down")
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsAccent)
                    .accessibilityHidden(true)
                endpoint("To", leg.to)
            }
        }
        .padding(PopsSpacing.md)
        .background(Color.popsBackground, in: RoundedRectangle(cornerRadius: PopsRadius.card))
    }

    private func endpoint(_ title: String, _ value: TripEndpoint) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(title.uppercased()).font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
            Text(tripEndpointName(value, places: places) ?? "Place not recorded")
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            TripsSourceMomentView(label: "Local time", moment: tripSourceMoment(for: value))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func legTitle(_ leg: TripJourneyLeg, index: Int) -> String {
        if let service = leg.service, !service.isEmpty { return service }
        return journey.legs.count == 1 ? "Route" : "Segment \(index + 1)"
    }

    private func facts(reference: String?, notes: String) -> [TripsSourceFact] {
        [
            reference.map { TripsSourceFact(label: "Booking reference", value: $0) },
            notes.isEmpty ? nil : TripsSourceFact(label: "Notes", value: notes),
        ].compactMap { $0 }
    }
}
