import AppCore

/// Joins independent reads without deriving placement, deletion, dates or booking state from detail data.
internal struct TripPlanLineProjection {
    internal let root: [TripPlanLineItem]
    internal let recorded: [TripPlanLineItem]
    internal let places: [TripPlace]

    internal init(route: TripRouteSnapshot, snapshot: TripSnapshot?) {
        let detail = snapshot.flatMap { $0.trip.id == route.tripId ? $0 : nil }
        let sources = detail.map(allTripSources)?.filter { $0.tripID == route.tripId } ?? []
        let visits = detail?.visits.filter { $0.tripId == route.tripId } ?? []
        let missing = Set(route.missingSources)
        places = detail?.places ?? []
        let join = TripPlanLineJoin(
            visits: visits, sources: sources, places: places, missing: missing)
        root = route.order.map { token in
            let paths = route.paths.filter { token == .gap($0.gapId) }.map { path in
                TripPlanLinePath(
                    id: path.id, title: path.title, state: path.state,
                    members: path.members.map {
                        join.item($0, id: .path(path.id, $0))
                    })
            }
            if let source = token.source {
                return join.item(source, id: .root(token))
            }
            return TripPlanLineItem(id: .root(token), content: .gap(token.id), paths: paths)
        }
        let active = Set(
            route.order.compactMap(\.source)
                + route.paths.filter { $0.state == .alternative }.flatMap(\.members))
        let displayedVisitIDs = Set(
            visits.filter {
                !missing.contains(.visit($0.id))
            }.map(\.id))
        recorded =
            visits.filter {
                !active.contains(.visit($0.id)) && !missing.contains(.visit($0.id))
            }.map {
                join.item(.visit($0.id), id: .recordedVisit($0.id))
            }
            + sources.filter { source in
                if case .journey(let journey) = source {
                    return !active.contains(.journey(journey.id))
                        && !missing.contains(.journey(journey.id))
                }
                guard let visitID = source.visitID else { return true }
                return !displayedVisitIDs.contains(visitID)
            }.map {
                TripPlanLineItem(id: .recordedSource($0.id), content: .source($0), paths: [])
            }
    }
}

private struct TripPlanLineJoin {
    let visits: [TripVisit]
    let sources: [TripSource]
    let places: [TripPlace]
    let missing: Set<TripRouteSource>

    func item(_ source: TripRouteSource, id: TripPlanLineIdentity) -> TripPlanLineItem {
        TripPlanLineItem(id: id, content: content(source), paths: [])
    }

    private func content(_ source: TripRouteSource) -> TripPlanLineItem.Content {
        if missing.contains(source) { return .missing(source) }
        switch source {
        case .visit(let id):
            guard let visit = visits.first(where: { $0.id == id }) else {
                return .unavailable(source)
            }
            return .visit(
                visit,
                place: places.first { $0.id == visit.placeId }?.name ?? "Place unavailable",
                sources: sources.filter { $0.visitID == id })
        case .journey(let id):
            guard
                let journey = sources.first(where: {
                    if case .journey(let journey) = $0 { return journey.id == id }
                    return false
                })
            else { return .unavailable(source) }
            return .source(journey)
        }
    }
}
