/// Projects Today without alternative-only arrangements; route-selected and unassociated sources remain.
/// The original catalogue, search records, source clocks and metadata are never modified.
internal func tripsBrowserTodayState(_ trip: TripsBrowserTrip) -> TripsTodayState {
    var alternatives: Set<String> = []
    var selected: Set<String> = []
    for entry in trip.route {
        switch entry {
        case .alternative(let alternative): alternatives.formUnion(alternative.sourceIDs)
        case .transport(let id): selected.insert(id)
        case .visit(let id):
            if let visit = trip.visits.first(where: { $0.id == id }) {
                selected.formUnion(visit.sourceIDs)
            }
        case .gap: break
        }
    }
    let excluded = alternatives.subtracting(selected)
    var today = trip.today
    today.stays = today.stays.filter { !excluded.contains($0.id) }
    today.journeys = today.journeys.filter { !excluded.contains($0.id) }
    today.events = today.events.filter { !excluded.contains($0.id) }
    return today
}
