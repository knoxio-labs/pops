import AppCore

internal struct TripPlanMapPinState: Equatable {
    private(set) var savedPins: [Int: TripPlacePin] = [:]
    private(set) var draftPlaceID: Int?
    private(set) var draft: TripPlacePin?
    private(set) var serverRevision = 0

    internal mutating func select(placeID: Int?) {
        guard draftPlaceID != placeID else { return }
        draftPlaceID = placeID
        draft = nil
    }

    internal mutating func propose(_ pin: TripPlacePin, for placeID: Int) {
        draftPlaceID = placeID
        draft = pin
    }

    internal mutating func confirm(
        _ pin: TripPlacePin, for placeID: Int, expectedServerRevision: Int
    ) {
        guard expectedServerRevision == serverRevision else { return }
        savedPins[placeID] = pin
        if draftPlaceID == placeID, draft == pin { draft = nil }
    }

    internal mutating func refreshFromServer() {
        serverRevision += 1
        savedPins.removeAll()
        draft = nil
    }

    internal func storedPin(for place: TripPlace) -> TripPlacePin? {
        savedPins[place.id] ?? place.pin
    }

    internal func draftPin(for place: TripPlace) -> TripPlacePin? {
        guard draftPlaceID == place.id, let draft, draft != storedPin(for: place) else {
            return nil
        }
        return draft
    }

    internal func canSave(writerAvailable: Bool, place: TripPlace?) -> Bool {
        guard writerAvailable, let place else { return false }
        return draftPin(for: place) != nil
    }
}
