/// Writes one explicit map point on a Trip-owned reusable place.
public protocol TripPlacePinWriting: Sendable {
    /// Returns nil only when the trip or one of its visit places no longer exists.
    func updatePin(
        tripID: Int, placeID: Int, pin: TripPlacePin
    ) async throws -> TripPlace?
}
