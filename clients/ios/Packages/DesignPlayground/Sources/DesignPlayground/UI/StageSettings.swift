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
    var appearance: Appearance = .system
    var typeSize: DynamicTypeSize = .playgroundDefault
    var rightToLeft = false

    /// What has been moved off the surface's own defaults, shortest first.
    ///
    /// What the inspector reports, so a reviewer never forgets they are
    /// looking at AX5 in dark and files it as a bug. One list rather than a
    /// predicate here and a summary in the view: they are the same question,
    /// and asking it twice is how they drifted — the summary treated any
    /// appearance other than ``Appearance/light`` as "Dark", so a surface left
    /// on System reported itself as dark, and one actually set to Light
    /// reported no appearance at all.
    func modifications(from surface: DesignSurface) -> [String] {
        var parts: [String] = []
        if appearance != .system { parts.append(appearance.title) }
        if typeSize != .playgroundDefault { parts.append(typeSize.playgroundLabel) }
        if rightToLeft { parts.append("RTL") }
        if chrome != surface.chrome { parts.append(chrome.title) }
        return parts
    }

    func isModified(from surface: DesignSurface) -> Bool {
        !modifications(from: surface).isEmpty
    }
}
