import AppCore
import Testing

@testable import FeatureTrips

internal struct TripPlanMapPinStateTests {
    @Test func draftRemainsUnconfirmedAndIsDiscardedWhenSelectionChanges() throws {
        let saved = try TripPlacePin(latitude: -33.87, longitude: 151.21)
        let candidate = try TripPlacePin(latitude: -34.92, longitude: 138.60)
        let sydney = TripPlace(id: 1, name: "Sydney", pin: saved, sourceLinks: [])
        let dallas = TripPlace(id: 2, name: "Dallas", sourceLinks: [])
        var state = TripPlanMapPinState()

        state.select(placeID: sydney.id)
        state.propose(candidate, for: sydney.id)

        #expect(state.storedPin(for: sydney) == saved)
        #expect(state.draftPin(for: sydney) == candidate)
        #expect(state.canSave(writerAvailable: true, place: sydney))

        state.select(placeID: dallas.id)
        #expect(state.draftPin(for: sydney) == nil)
        #expect(state.storedPin(for: sydney) == saved)

        state.select(placeID: sydney.id)
        #expect(state.draftPin(for: sydney) == nil)
        #expect(state.storedPin(for: sydney) == saved)
    }

    @Test func unchangedPinAndMissingWriterCannotBeSaved() throws {
        let saved = try TripPlacePin(latitude: -33.87, longitude: 151.21)
        let place = TripPlace(id: 1, name: "Sydney", pin: saved, sourceLinks: [])
        var state = TripPlanMapPinState()

        state.select(placeID: place.id)
        state.propose(saved, for: place.id)

        #expect(state.draftPin(for: place) == nil)
        #expect(!state.canSave(writerAvailable: true, place: place))
        #expect(!state.canSave(writerAvailable: false, place: place))
    }

    @Test func confirmedLocalPinYieldsToTheNextServerSnapshot() throws {
        let original = try TripPlacePin(latitude: -33.87, longitude: 151.21)
        let confirmed = try TripPlacePin(latitude: -34.92, longitude: 138.60)
        let refreshed = try TripPlacePin(latitude: -23.55, longitude: -46.63)
        let originalPlace = TripPlace(id: 1, name: "Sydney", pin: original, sourceLinks: [])
        let refreshedPlace = TripPlace(id: 1, name: "Sydney", pin: refreshed, sourceLinks: [])
        var state = TripPlanMapPinState()

        state.select(placeID: originalPlace.id)
        state.propose(confirmed, for: originalPlace.id)
        state.confirm(
            confirmed, for: originalPlace.id, expectedServerRevision: state.serverRevision)
        #expect(state.storedPin(for: originalPlace) == confirmed)
        #expect(state.draftPin(for: originalPlace) == nil)

        state.refreshFromServer()

        #expect(state.storedPin(for: refreshedPlace) == refreshed)
        #expect(state.draftPin(for: refreshedPlace) == nil)
    }

    @Test func lateSaveResponseCannotOverrideARefreshedServerPin() throws {
        let confirmed = try TripPlacePin(latitude: -34.92, longitude: 138.60)
        let refreshed = try TripPlacePin(latitude: -23.55, longitude: -46.63)
        let place = TripPlace(id: 1, name: "Sydney", pin: refreshed, sourceLinks: [])
        var state = TripPlanMapPinState()
        let saveRevision = state.serverRevision

        state.refreshFromServer()
        state.confirm(confirmed, for: place.id, expectedServerRevision: saveRevision)

        #expect(state.storedPin(for: place) == refreshed)
    }
}
