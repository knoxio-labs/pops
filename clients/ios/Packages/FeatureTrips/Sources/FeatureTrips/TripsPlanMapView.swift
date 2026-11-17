import AppCore
import DesignSystem
import MapKit
import SwiftUI

internal struct TripsPlanMapView: View {
    internal let route: TripRouteSnapshot
    internal let snapshot: TripSnapshot?
    internal let writer: (any TripPlacePinWriting)?
    @State private var camera: MapCameraPosition = .automatic
    @State private var selectedPlaceID: Int?
    @State private var searchText = ""
    @State private var results: [MKMapItem] = []
    @State private var pins: [Int: TripPlacePin] = [:]
    @State private var draft: TripPlacePin?
    @State private var isSearching = false
    @State private var isSaving = false
    @State private var failure: String?

    private var places: [TripPlace] {
        TripPlanMapProjection(route: route, snapshot: snapshot).places
    }

    private var projection: TripPlanMapProjection {
        TripPlanMapProjection(route: route, snapshot: snapshot)
    }

    private var mapSegments: [[TripPlacePin]] {
        projection.pinnedSegments(using: pin(for:))
    }

    private var selectedPlace: TripPlace? {
        places.first { $0.id == selectedPlaceID }
    }

    private var renderedCoordinates: [CLLocationCoordinate2D] {
        places.compactMap { place in
            let pin =
                place.id == selectedPlaceID
                ? (draft ?? pins[place.id] ?? place.pin) : (pins[place.id] ?? place.pin)
            guard let pin else { return nil }
            return CLLocationCoordinate2D(latitude: pin.latitude, longitude: pin.longitude)
        }
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            placePicker
            searchField
            if !results.isEmpty { searchResults }
            map
            selectedPlaceCard
        }
        .onAppear(perform: prepare)
        .onChange(of: selectedPlaceID) { _, _ in prepareDraft() }
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

    private var searchField: some View {
        HStack(spacing: PopsSpacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
            TextField("Search Apple Maps", text: $searchText)
                .textContentType(.location)
                .submitLabel(.search)
                .onSubmit(search)
                .accessibilityIdentifier("trip-map-search")
            Button(action: search) {
                if isSearching {
                    ProgressView()
                } else {
                    Text("Search")
                }
            }
            .disabled(
                searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSearching
            )
            .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
            .accessibilityIdentifier("trip-map-search-button")
        }
        .padding(.horizontal, PopsSpacing.md)
        .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.control))
    }

    private var searchResults: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.sm) {
                ForEach(Array(results.enumerated()), id: \.offset) { _, item in
                    Button {
                        choose(item)
                    } label: {
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(item.name ?? item.placemark.title ?? "Map result")
                                .font(.popsSubheadline)
                                .lineLimit(1)
                            if let address = item.placemark.title {
                                Text(address)
                                    .font(.popsCaption)
                                    .foregroundStyle(Color.popsMutedForeground)
                                    .lineLimit(1)
                            }
                        }
                        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                        .padding(.horizontal, PopsSpacing.md)
                        .background(
                            Color.popsSurface,
                            in: RoundedRectangle(cornerRadius: PopsRadius.control))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .scrollIndicators(.hidden)
        .accessibilityLabel("Apple Maps search results")
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
                    if let pin = pin(for: place) {
                        Marker(place.name, coordinate: coordinate(for: pin))
                            .tint(place.id == selectedPlaceID ? Color.popsTrips : Color.popsAccent)
                    }
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .mapControls {
                MapCompass()
                MapScaleView()
            }
            .frame(minHeight: 300)
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
                draft = pin
                pins[selectedPlaceID] = pin
                failure = nil
            }
            .accessibilityIdentifier("trip-plan-map")
        }
    }

    @ViewBuilder private var selectedPlaceCard: some View {
        if let place = selectedPlace {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text(place.name).font(.popsTitle)
                        Text(
                            draft == nil
                                ? "Choose a search result or tap the map" : coordinatesLabel
                        )
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    }
                    Spacer(minLength: PopsSpacing.md)
                    PopsButton(
                        isSaving ? "Saving…" : "Save pin", prominence: .prominent, action: save
                    )
                    .disabled(writer == nil || draft == nil || isSaving)
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

    private var coordinatesLabel: String {
        guard let draft else { return "No selected point" }
        return String(format: "%.5f, %.5f", draft.latitude, draft.longitude)
    }

    private func prepare() {
        for place in places {
            if let pin = place.pin { pins[place.id] = pin }
        }
        if selectedPlaceID == nil { selectedPlaceID = places.first?.id }
        prepareDraft()
    }

    private func prepareDraft() {
        guard let selectedPlaceID else {
            draft = nil
            return
        }
        draft = pins[selectedPlaceID]
    }

    private func pin(for place: TripPlace) -> TripPlacePin? {
        if place.id == selectedPlaceID { return draft ?? pins[place.id] ?? place.pin }
        return pins[place.id] ?? place.pin
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
        let coordinate = item.placemark.coordinate
        guard let selectedPlaceID,
            let pin = try? TripPlacePin(
                latitude: coordinate.latitude, longitude: coordinate.longitude)
        else { return }
        pins[selectedPlaceID] = pin
        draft = pin
        camera = .item(item)
        results = []
        failure = nil
    }

    private func save() {
        guard let writer, let place = selectedPlace, let draft else { return }
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
                pins[saved.id] = saved.pin
                self.draft = saved.pin
            } catch {
                failure = "Could not save this pin. Check your connection and try again."
            }
        }
    }
}
