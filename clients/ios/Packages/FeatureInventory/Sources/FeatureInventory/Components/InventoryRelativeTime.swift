import Foundation

/// When something happened, as the dashboard's rows say it: "12 min. ago",
/// "yesterday".
internal enum InventoryRelativeTime {
    /// A server clock slightly ahead of the phone's would otherwise read as
    /// "in 2 min." for something that has already happened, so a date past
    /// `now` is said as `now`.
    internal static func text(_ date: Date, now: Date = .now) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.dateTimeStyle = .named
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: min(date, now), relativeTo: now)
    }
}
