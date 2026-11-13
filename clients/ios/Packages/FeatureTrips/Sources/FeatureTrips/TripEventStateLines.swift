import AppCore
import DesignSystem
import SwiftUI

internal struct TripEventStateLines: View {
    internal let event: TripEvent
    internal var showsReference = true

    internal var body: some View {
        let states = [event.intention, event.arrangement].compactMap { $0 }
        if !states.isEmpty {
            Text(states.joined(separator: " · "))
                .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
        }
        if showsReference, let reference = event.reference, !reference.isEmpty {
            Text(reference).font(.popsMonospacedCaption)
        }
        if let address = event.address, !address.isEmpty { Text(address).font(.popsCaption) }
    }
}
