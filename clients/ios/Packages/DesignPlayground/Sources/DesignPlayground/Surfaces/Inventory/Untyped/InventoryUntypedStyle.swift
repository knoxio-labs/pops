import SwiftUI

/// The six questions POPS-4016 leaves open, as the knobs a screen turns.
///
/// Same arrangement as ``InventoryFoundationStyle`` and for the same reason:
/// an experiment varies exactly one of these and holds the rest at the
/// defaults below, so "held fixed" always names a value somebody can read
/// rather than an unstated choice.
///
/// None of these is decided. The defaults are the least committal answer to
/// each, not a preference: the screens have to draw something, and drawing the
/// boldest option would make the question look settled.
internal struct InventoryUntypedStyle: Equatable {
    /// What filing an item with no type is allowed to capture.
    internal enum Capture: Equatable {
        /// Name, photo, placement, note. Nothing structured at all.
        case noteOnly
        /// The note, plus one free key and value.
        case oneFreeProperty
        /// The note, with the questions a type would have asked offered as
        /// prompts. Still prose when it is saved.
        case promptedNote
    }

    /// How much an untyped item carries beside a typed one, over and above the
    /// "No type yet" the row already prints.
    internal enum ListPresence: Equatable {
        case rowOnly
        case badge
        case grouped
    }

    /// Whether the things waiting are a place you can go.
    internal enum QueueVisibility: Equatable {
        /// A counted queue, reachable and countable at any time.
        case counted
        /// No queue. A filter in Browse finds them and nothing chases them.
        case filterOnly
        /// Nothing to see until an update covers some of them.
        case onArrival
    }

    /// Who acts when a type arrives that covers waiting items.
    internal enum Arrival: Equatable {
        case silent
        case prompt
        case batchReview
    }

    /// Whether an item can be partly typed, or is typed or not.
    internal enum Typing: Equatable {
        case binary
        case partial
    }

    /// What a type gaining a field does to the items already on it, seen from
    /// the phone rather than from the migration.
    internal enum TypeChange: Equatable {
        case announced
        case onTheItem
        case reviewQueue
    }

    internal var capture: Capture = .noteOnly
    internal var listPresence: ListPresence = .rowOnly
    internal var queue: QueueVisibility = .counted
    internal var arrival: Arrival = .prompt
    internal var typing: Typing = .binary
    internal var typeChange: TypeChange = .onTheItem
}

extension EnvironmentValues {
    @Entry internal var inventoryUntypedStyle = InventoryUntypedStyle()
}
