import SwiftUI

/// Whether a line item's description and its amount fit on one row.
///
/// A value rather than a modifier chain, so the rule is assertable without a
/// rendered hierarchy. A layout decision that exists only inside a `body` is
/// one a test can prove nothing about — the same gap that let "layout" suites
/// elsewhere in this app pass with their `ScrollView` deleted.
internal enum ReceiptLineLayout {
    /// Two columns until the text sizes where two columns stop being two
    /// columns. Keyed on `isAccessibilitySize` rather than on a chosen
    /// threshold, because that is the boundary the platform itself draws
    /// between "larger text" and "text large enough that layouts have to
    /// change".
    internal static func stacks(at size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }
}
