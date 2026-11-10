import Foundation

/// Groups by the first and last explicitly ordered route visits, using valid exact source bounds only.
/// Open, approximate and contradictory boundaries cannot establish a current trip or completed travel.
internal func tripsBrowserPeriod(_ trip: TripsBrowserTrip) -> TripsBrowserPeriod {
    guard let day = tripsTodayDay(trip.today.now, zone: trip.today.displayZone) else {
        return .other
    }
    let visits = trip.route.compactMap { entry -> String? in
        guard case .visit(let id) = entry else { return nil }
        return id
    }
    let first = visits.first.flatMap { id in trip.visits.first { $0.id == id } }
    let last = visits.last.flatMap { id in trip.visits.first { $0.id == id } }
    if let first, !tripsBrowserValidVisitTiming(first.timing) { return .other }
    if let last, !tripsBrowserValidVisitTiming(last.timing) { return .other }
    let start = first.flatMap { tripsBrowserVisitBounds($0.timing).from }
    let end = last.flatMap { tripsBrowserVisitBounds($0.timing).to }
    if let start, let end, start > end { return .other }
    if let start, let end, start <= day, day <= end { return .current }
    if let start, start > day { return .future }
    if let end, end < day { return .history }
    return .other
}

/// Formats only recorded visit precision; absent or invalid timing renders no date label.
internal func tripsBrowserVisitTimingLabel(_ timing: TripsBrowserVisitTiming) -> String {
    guard tripsBrowserValidVisitTiming(timing) else { return "" }
    switch timing {
    case .unknown: return ""
    case .month(let month):
        guard tripsBrowserValidMonth(month),
            let date = tripsBrowserCalendarDate(month + "-01", zone: "UTC")
        else {
            return ""
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = tripsTodayTimeZone("UTC")
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: date)
    case .dates(let from, let to):
        let first = from.flatMap(tripsTodayDayLabel)
        let last = to.flatMap(tripsTodayDayLabel)
        if let first, let last { return first == last ? first : first + " – " + last }
        if let first { return "From " + first }
        if let last { return "Until " + last }
        return ""
    }
}

/// Validates only the supplied precision; optional unknown bounds remain valid source facts.
internal func tripsBrowserValidVisitTiming(_ timing: TripsBrowserVisitTiming) -> Bool {
    switch timing {
    case .unknown: return true
    case .month(let month): return tripsBrowserValidMonth(month)
    case .dates(let from, let to):
        if let from, !tripsTodayValidDay(from) { return false }
        if let to, !tripsTodayValidDay(to) { return false }
        if let from, let to, from > to { return false }
        return true
    }
}

/// Validates month precision without manufacturing a date interval from it.
internal func tripsBrowserValidMonth(_ month: String) -> Bool {
    month.count == 7 && tripsTodayValidDay(month + "-01")
}

/// Calendar-picker bridge only: represents a valid civil day in its explicit display zone.
/// This Date is presentation state, never a booking clock or an inferred source midnight.
internal func tripsBrowserCalendarDate(_ day: String, zone: String) -> Date? {
    guard tripsTodayValidDay(day), let timeZone = tripsTodayTimeZone(zone) else { return nil }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = timeZone
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.isLenient = false
    guard let date = formatter.date(from: day), formatter.string(from: date) == day else {
        return nil
    }
    return date
}

/// Converts native picker presentation state to a civil day in the same explicitly selected zone.
internal func tripsBrowserCalendarDay(_ date: Date, zone: String) -> String? {
    guard let timeZone = tripsTodayTimeZone(zone) else { return nil }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = timeZone
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
}

private func tripsBrowserVisitBounds(_ timing: TripsBrowserVisitTiming) -> (
    from: String?, to: String?
) {
    guard case .dates(let from, let to) = timing else { return (nil, nil) }
    if let from, !tripsTodayValidDay(from) { return (nil, nil) }
    if let to, !tripsTodayValidDay(to) { return (nil, nil) }
    if let from, let to, from > to { return (nil, nil) }
    return (from, to)
}
