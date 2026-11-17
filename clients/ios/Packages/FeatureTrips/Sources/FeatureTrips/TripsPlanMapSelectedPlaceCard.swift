import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanMapSelectedPlaceCard: View {
    internal let place: TripPlace?
    internal let coordinatesLabel: String
    internal let isSaving: Bool
    internal let canSave: Bool
    internal let failure: String?
    internal let save: () -> Void

    internal var body: some View {
        if let place {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text(place.name).font(.popsTitle)
                        Text(coordinatesLabel)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    Spacer(minLength: PopsSpacing.md)
                    PopsButton(
                        isSaving ? "Saving…" : "Save pin", prominence: .prominent, action: save
                    )
                    .disabled(!canSave)
                    .accessibilityIdentifier("trip-map-save-pin")
                }
                if let failure {
                    Label(failure, systemImage: "exclamationmark.triangle")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsTripsAttention)
                        .accessibilityAddTraits(.isStaticText)
                }
            }
            .padding(PopsSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                Color.popsTripsTint, in: RoundedRectangle(cornerRadius: PopsRadius.featuredCard))
        } else {
            ContentUnavailableView("No route places", systemImage: "map")
        }
    }
}
