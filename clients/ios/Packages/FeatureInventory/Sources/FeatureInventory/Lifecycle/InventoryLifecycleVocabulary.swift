import AppCore
import Foundation

/// Something the More menu asks Item detail to do to the item's lifecycle.
internal enum InventoryLifecycleCommand: Equatable {
    case discard(InventoryDiscardReason?)
    case markLost
    case retire
    case restore
    case destroy
    case split
    case changeQuantity
}

extension InventoryDiscardReason {
    /// The reasons the Discard submenu offers, in the order it lists them.
    /// `unrecognised` is something a server can send back, never something
    /// this build offers.
    internal static let offered: [InventoryDiscardReason] = [
        .donated, .sold, .usedUp, .broken, .gaveAway,
    ]

    internal var label: String {
        switch self {
        case .donated: "Donated"
        case .sold: "Sold"
        case .usedUp: "Used up"
        case .broken: "Broken"
        case .gaveAway: "Gave away"
        case .unrecognised(let wire): wire.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .donated: .donated
        case .sold: .sold
        case .usedUp: .consumed
        case .broken: .broken
        case .gaveAway: .gaveAway
        case .unrecognised: .discard
        }
    }
}

extension InventoryLifecycle {
    /// The badge's word, and the verb the history and the notice use.
    internal var label: String {
        switch self {
        case .active: "Active"
        case .retired: "Retired"
        case .discarded: "Discarded"
        case .lost: "Lost"
        case .destroyed: "Destroyed"
        case .unrecognised(let wire): wire.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .active, .unrecognised: .item
        case .retired: .retired
        case .discarded: .discard
        case .lost: .lost
        case .destroyed: .destroyed
        }
    }
}

extension InventoryLifecycleChange {
    /// The inactive page's one line: "Discarded 3 Sep · Donated".
    internal func notice(now: Date = .now, calendar: Calendar = .autoupdatingCurrent) -> String {
        let head =
            "\(lifecycle.label) \(InventoryHistoryDate.when(changedAt, now: now, calendar: calendar))"
        guard let reason else { return head }
        return "\(head) · \(reason.label)"
    }
}

/// What kind of thing happened, which is what the History page filters by.
internal enum InventoryHistoryKind: String, CaseIterable, Hashable, Identifiable {
    case move
    case lifecycle
    case edit

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .move: "Moves"
        case .lifecycle: "Lifecycle"
        case .edit: "Edits"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .move: .move
        case .lifecycle: .restore
        case .edit: .edit
        }
    }
}

/// How the History page and the lifecycle notice say when something
/// happened: "Today", "Yesterday", "3 Sep", or "14 Feb 2025" once it is not
/// this year, and the month heading a line is filed under.
internal enum InventoryHistoryDate {
    internal static func when(_ date: Date, now: Date, calendar: Calendar) -> String {
        let shown = min(date, now)
        if calendar.isDate(shown, inSameDayAs: now) { return "Today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
            calendar.isDate(shown, inSameDayAs: yesterday)
        {
            return "Yesterday"
        }
        var style = Date.FormatStyle(calendar: calendar, timeZone: calendar.timeZone)
            .day().month(.abbreviated)
        if calendar.component(.year, from: shown) != calendar.component(.year, from: now) {
            style = style.year()
        }
        return shown.formatted(style)
    }

    internal static func month(_ date: Date, calendar: Calendar) -> String {
        date.formatted(
            Date.FormatStyle(calendar: calendar, timeZone: calendar.timeZone).month(.wide).year())
    }
}
