import AppCore

internal func tripName(_ trip: TripRecord) -> String {
    trip.name ?? (trip.destination.isEmpty ? "Trip \(trip.id)" : trip.destination)
}

extension TripSource {
    internal func displayName(places: [TripPlace]) -> String {
        if case .journey(let journey) = self, journey.name == nil {
            let route = routeLabel(places: places)
            if !route.isEmpty { return route }
        }
        return name
    }

    internal func routeLabel(places: [TripPlace]) -> String {
        guard case .journey(let journey) = self else { return summary }
        return journey.legs.map { leg in
            [tripEndpointName(leg.from, places: places), tripEndpointName(leg.to, places: places)]
                .compactMap { $0 }.joined(separator: " → ")
        }.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

internal func tripEndpointName(_ endpoint: TripEndpoint, places: [TripPlace]) -> String? {
    if let label = endpoint.sourceLabel, !label.isEmpty { return label }
    guard let id = endpoint.placeId else { return nil }
    return places.first { $0.id == id }?.name ?? "Place \(id) unavailable"
}
