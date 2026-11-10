import AppCore
import Foundation

internal func tripSourceMatches(_ source: TripSource, query: String, places: [TripPlace]) -> Bool {
    let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return true }
    var fields = [source.displayName(places: places), source.routeLabel(places: places)]
    switch source {
    case .stay(let stay):
        fields += [stay.address, stay.reference, stay.notes, stay.kind, stay.status].compactMap {
            $0
        }
    case .event(let event):
        fields += [
            event.address, event.reference, event.notes, event.intention, event.arrangement,
            event.purchase, event.sourceUrl, event.ticketUrl,
        ].compactMap { $0 }
    case .journey(let journey):
        fields += [journey.reference, journey.notes].compactMap { $0 }
        fields += journey.legs.flatMap {
            [
                $0.reference, $0.service, $0.operator, $0.notes, $0.intention, $0.arrangement,
                $0.purchase,
            ]
            .compactMap { $0 }
        }
    }
    return fields.contains { $0.localizedCaseInsensitiveContains(query) }
}
