import AppCore
import FeatureReceiptCapture
import SwiftUI

/// The questions asked about a surface, and the answers competing to settle
/// them.
///
/// Split out of ``Catalog`` rather than listed there because a catalogue of
/// three kinds in one type outgrows what a reader can hold — the same reason
/// ``ComponentCatalog`` is its own file. ``Catalog`` still names all three, so
/// there is one place to look for what the playground contains.
///
/// A decided or archived experiment stays here. What was chosen, and why, is
/// the part worth keeping: a design decision with no record of the alternative
/// is one that gets relitigated every time somebody new looks at the screen.
@MainActor
internal enum ExperimentCatalog {
    /// Composed by area, the way ``Catalog`` composes surfaces. One list of
    /// every experiment in the playground had outgrown what a reader can hold
    /// and what the length limits allow, and the areas are where it wanted to
    /// come apart.
    internal static let all: [DesignExperiment] =
        PurchasesExperiments.all + AccountsExperiments.all
}
