import SwiftUI

/// Everything the inspector can change about how a surface is drawn, held in
/// one value so the stage passes it down and the inspector writes it back
/// without either naming the other's internals.
///
/// Deliberately not persisted. The playground stores nothing — reopening a
/// surface gives you the conditions its author chose, not the ones you last
/// happened to leave on, which is what stops a review from silently being
/// about the wrong appearance.
internal struct StageSettings {
    var stateID: String
    var chrome: Chrome
    var appearance: Appearance = .light
    var typeSize: DynamicTypeSize = .playgroundDefault
    var rightToLeft = false

    /// True when anything has been moved off the surface's own defaults —
    /// what the collapsed inspector badges, so a reviewer never forgets they
    /// are looking at AX5 in dark and reports it as a bug.
    func isModified(from surface: DesignSurface) -> Bool {
        chrome != surface.chrome
            || appearance != .light
            || typeSize != .playgroundDefault
            || rightToLeft
    }
}
