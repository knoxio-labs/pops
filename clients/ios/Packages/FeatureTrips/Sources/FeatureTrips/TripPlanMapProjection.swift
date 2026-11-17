import AppCore

internal struct TripPlanMapProjection {
    internal let places: [TripPlace]
    internal let paths: [[TripPlace]]

    internal init(route: TripRouteSnapshot, snapshot: TripSnapshot?) {
        guard let snapshot, snapshot.trip.id == route.tripId else {
            places = []
            paths = []
            return
        }
        let visits = Self.uniqueByID(snapshot.visits)
        let journeys = Self.uniqueByID(snapshot.journeys)
        let placeByID = Self.uniqueByID(snapshot.places)
        let sourceGroups =
            [route.order.compactMap(\.source)]
            + route.paths.filter { $0.state == .alternative }.map(\.members)
        paths = sourceGroups.map {
            Self.resolve($0, visits: visits, journeys: journeys, places: placeByID)
        }.filter { !$0.isEmpty }
        var seen: Set<Int> = []
        places = paths.flatMap { $0 }.filter { seen.insert($0.id).inserted }
    }

    internal func pinnedSegments(
        using selectedPin: (TripPlace) -> TripPlacePin?
    ) -> [TripPlanMapSegment] {
        paths.enumerated().flatMap { pathIndex, path in
            var segments: [TripPlanMapSegment] = []
            var current: [TripPlacePin] = []
            for place in path {
                if let pin = selectedPin(place) {
                    current.append(pin)
                } else {
                    if current.count > 1 {
                        segments.append(TripPlanMapSegment(pathIndex: pathIndex, pins: current))
                    }
                    current = []
                }
            }
            if current.count > 1 {
                segments.append(TripPlanMapSegment(pathIndex: pathIndex, pins: current))
            }
            return segments
        }
    }

    private static func resolve(
        _ sources: [TripRouteSource],
        visits: [Int: TripVisit],
        journeys: [Int: TripJourney],
        places: [Int: TripPlace]
    ) -> [TripPlace] {
        var seen: Set<Int> = []
        var result: [TripPlace] = []
        for source in sources {
            switch source {
            case .visit(let id):
                guard let placeID = visits[id]?.placeId else { continue }
                Self.append(placeID, places: places, seen: &seen, result: &result)
            case .journey(let id):
                guard let journey = journeys[id] else { continue }
                for leg in journey.legs {
                    if let placeID = leg.from.placeId {
                        Self.append(placeID, places: places, seen: &seen, result: &result)
                    }
                    if let placeID = leg.to.placeId {
                        Self.append(placeID, places: places, seen: &seen, result: &result)
                    }
                }
            }
        }
        return result
    }

    private static func append(
        _ id: Int, places: [Int: TripPlace], seen: inout Set<Int>, result: inout [TripPlace]
    ) {
        guard seen.insert(id).inserted, let place = places[id] else { return }
        result.append(place)
    }

    private static func uniqueByID<Value: Identifiable>(
        _ values: [Value]
    ) -> [Value.ID: Value] where Value.ID: Hashable {
        Dictionary(grouping: values, by: \.id).compactMapValues { values in
            values.count == 1 ? values.first : nil
        }
    }
}

internal struct TripPlanMapSegment: Equatable {
    internal let pathIndex: Int
    internal let pins: [TripPlacePin]
}
