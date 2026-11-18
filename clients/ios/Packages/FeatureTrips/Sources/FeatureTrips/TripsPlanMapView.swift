import AppCore
import DesignSystem
import MapKit
import SwiftUI

internal struct TripsPlanMapView: View {
    internal let route: TripRouteSnapshot
    internal let snapshot: TripSnapshot?
    internal let writer: (any TripPlacePinWriting)?
    @State private var camera: MapCameraPosition = .automatic
    @ScaledMetric(relativeTo: .body) private var mapCanvasHeight = PopsSize.mapCanvasHeight
    @State private var selectedPlaceID: Int?
    @State private var searchText = ""
    @State private var results: [MKMapItem] = []
    @State private var pinState = TripPlanMapPinState()
    @State private var isSearching = false
    @State private var isSaving = false
    @State private var failure: String?

    private var places: [TripPlace] {
        TripPlanMapProjection(route: route, snapshot: snapshot).places
    }

    private var projection: TripPlanMapProjection {
        TripPlanMapProjection(route: route, snapshot: snapshot)
    }

    private var mapSegments: [TripPlanMapSegment] {
        projection.pinnedSegments(using: pinState.storedPin(for:))
    }

    private var selectedPlace: TripPlace? {
        places.first { $0.id == selectedPlaceID }
    }

    private var renderedCoordinates: [CLLocationCoordinate2D] {
        places.compactMap { place in
            let pin = pinState.storedPin(for: place)
            guard let pin else { return nil }
            return CLLocationCoordinate2D(latitude: pin.latitude, longitude: pin.longitude)
        }
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            placePicker
            TripsPlanMapSearchPanel(
                searchText: $searchText, results: results, isSearching: isSearching,
                search: search, choose: choose)
            map
            TripsPlanMapSelectedPlaceCard(
                place: selectedPlace, coordinatesLabel: coordinatesLabel, isSaving: isSaving,
                canSave: pinState.canSave(writerAvailable: writer != nil, place: selectedPlace)
                    && !isSaving,
                failure: failure, save: save)
        }
        .onAppear(perform: prepare)
        .onChange(of: selectedPlaceID) { _, placeID in selectPlace(placeID) }
        .onChange(of: snapshot) { _, _ in pinState.refreshFromServer() }
    }

    private var placePicker: some View {
        Picker("Route place", selection: $selectedPlaceID) {
            ForEach(places) { place in
                Text(place.name).tag(Optional(place.id))
            }
        }
        .pickerStyle(.menu)
        .frame(minHeight: PopsSize.touchTarget)
        .accessibilityIdentifier("trip-map-place-picker")
    }

    private var map: some View {
        MapReader { proxy in
            Map(position: $camera) {
                ForEach(Array(mapSegments.enumerated()), id: \.offset) { _, segment in
                    let coordinates = segment.pins.map(coordinate(for:))
                    MapPolyline(coordinates: coordinates)
                        .stroke(
                            segment.pathIndex == 0
                                ? Color.popsTrips : Color.popsMutedForeground,
                            lineWidth: PopsBorder.emphasis)
                }
                ForEach(places) { place in
                    if let pin = pinState.storedPin(for: place) {
                        Marker(place.name, coordinate: coordinate(for: pin))
                            .tint(place.id == selectedPlaceID ? Color.popsTrips : Color.popsAccent)
                    }
                    if let draft = pinState.draftPin(for: place) {
                        Marker("Unsaved pin for \(place.name)", coordinate: coordinate(for: draft))
                            .tint(Color.popsTripsAttention)
                    }
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .mapControls {
                MapCompass()
                MapScaleView()
            }
            .frame(minHeight: mapCanvasHeight)
            .clipShape(RoundedRectangle(cornerRadius: PopsRadius.featuredCard))
            .overlay(alignment: .bottomLeading) {
                Label("Tap map to adjust selected pin", systemImage: "hand.tap")
                    .font(.popsCaption)
                    .padding(PopsSpacing.sm)
                    .background(.regularMaterial, in: Capsule())
                    .padding(PopsSpacing.md)
                    .allowsHitTesting(false)
            }
            .onTapGesture(coordinateSpace: .local) { point in
                guard let point = proxy.convert(point, from: .local), selectedPlace != nil,
                    let selectedPlaceID,
                    let pin = try? TripPlacePin(
                        latitude: point.latitude, longitude: point.longitude)
                else { return }
                pinState.propose(pin, for: selectedPlaceID)
                failure = nil
            }
            .accessibilityIdentifier("trip-plan-map")
        }
    }

    private var coordinatesLabel: String {
        guard let selectedPlace else { return "Choose a route place" }
        if let draft = pinState.draftPin(for: selectedPlace) {
            return "Unsaved · \(formattedCoordinates(draft))"
        }
        if let pin = pinState.storedPin(for: selectedPlace) {
            return "Saved · \(formattedCoordinates(pin))"
        }
        return "Choose a search result or tap the map"
    }

    private func prepare() {
        if selectedPlaceID == nil { selectedPlaceID = places.first?.id }
        pinState.select(placeID: selectedPlaceID)
    }

    private func selectPlace(_ placeID: Int?) {
        pinState.select(placeID: placeID)
        failure = nil
    }

    private func formattedCoordinates(_ pin: TripPlacePin) -> String {
        String(format: "%.5f, %.5f", pin.latitude, pin.longitude)
    }

    private func coordinate(for pin: TripPlacePin) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: pin.latitude, longitude: pin.longitude)
    }

    private func search() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }
        isSearching = true
        failure = nil
        Task { @MainActor in
            defer { isSearching = false }
            do {
                let request = MKLocalSearch.Request()
                request.naturalLanguageQuery = query
                if let center = renderedCoordinates.first {
                    request.region = MKCoordinateRegion(
                        center: center,
                        span: MKCoordinateSpan(latitudeDelta: 1, longitudeDelta: 1))
                }
                results = try await MKLocalSearch(request: request).start().mapItems
                if results.isEmpty { failure = "No places found. Try a nearby city or landmark." }
            } catch {
                failure = "Apple Maps search could not complete. Try again."
            }
        }
    }

    private func choose(_ item: MKMapItem) {
        let coordinate = tripMapItemCoordinate(item)
        guard let selectedPlaceID,
            let pin = try? TripPlacePin(
                latitude: coordinate.latitude, longitude: coordinate.longitude)
        else { return }
        pinState.propose(pin, for: selectedPlaceID)
        camera = .item(item)
        results = []
        failure = nil
    }

    private func save() {
        guard let writer, let place = selectedPlace,
            let draft = pinState.draftPin(for: place),
            pinState.canSave(writerAvailable: true, place: place)
        else { return }
        let expectedServerRevision = pinState.serverRevision
        isSaving = true
        failure = nil
        Task { @MainActor in
            defer { isSaving = false }
            do {
                guard
                    let saved = try await writer.updatePin(
                        tripID: route.tripId, placeID: place.id, pin: draft)
                else {
                    failure = "This place is no longer on the trip. Refresh Plan and try again."
                    return
                }
                guard let savedPin = saved.pin else {
                    failure = "Save unconfirmed. Refresh Plan to verify."
                    return
                }
                pinState.confirm(
                    savedPin, for: saved.id, expectedServerRevision: expectedServerRevision)
            } catch {
                failure = "Could not save this pin. Check your connection and try again."
            }
        }
    }
}
