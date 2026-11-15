import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
internal final class TripsPlanCalendarSelection {
    private var day: String?
    private var epoch: UUID?

    internal func binding(for model: TripsModel) -> Binding<String?> {
        guard let id = model.selectedID else { return .constant(nil) }
        let token = model.tripSelectionEpoch
        return Binding(
            get: {
                model.tripSelectionEpoch == token && model.selectedID == id && self.epoch == token
                    ? self.day : nil
            },
            set: { day in
                guard model.tripSelectionEpoch == token, model.selectedID == id else {
                    return
                }
                self.epoch = token
                self.day = day
            })
    }
}
