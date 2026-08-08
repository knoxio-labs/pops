import SwiftUI

/// Typography scale. Every token is built from a `Font.TextStyle` rather than a
/// point size, which is what makes Dynamic Type work: the system scales the
/// style, and a fixed size would opt the whole app out of that silently.
extension Font {
    /// Screen and section titles.
    public static let popsTitle = Font.system(.title2, weight: .semibold)

    /// The lead line of a row or card.
    public static let popsHeadline = Font.system(.headline)

    /// Running text.
    public static let popsBody = Font.system(.body)

    /// The supporting line under a headline.
    public static let popsSubheadline = Font.system(.subheadline)

    /// Metadata and footnotes.
    public static let popsCaption = Font.system(.caption)

    /// Identifiers, amounts and anything that must align in a column.
    public static let popsMonospaced = Font.system(.body, design: .monospaced)
}
