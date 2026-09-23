internal enum PurchaseStagingGridLogic {
    /// Where a drag over the grid can land.
    internal enum DropTarget: Hashable {
        case page(String)
        case receipt(String)
        case loose
    }

    /// What Cancel does: leave at once when nothing is staged, otherwise ask before discarding.
    internal enum CancelAction: Equatable {
        case leave
        case confirmDiscard
    }

    internal static func cancel(isEmpty: Bool) -> CancelAction {
        isEmpty ? .leave : .confirmDiscard
    }

    /// The highlighted target after a drag enters or exits `target`. Leaving a target clears the
    /// highlight only if that target still holds it, so an exit that arrives after the next enter
    /// cannot clear the newer highlight.
    internal static func highlight(
        after over: Bool, on target: DropTarget, current: DropTarget?
    ) -> DropTarget? {
        if over { return target }
        return current == target ? nil : current
    }
}
