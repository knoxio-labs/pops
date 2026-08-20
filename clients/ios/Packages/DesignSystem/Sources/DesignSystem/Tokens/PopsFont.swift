import SwiftUI

/// Typography scale. Every token is built from a `Font.TextStyle` rather than a
/// point size, which is what makes Dynamic Type work: the system scales the
/// style, and a fixed size would opt the whole app out of that silently.
extension Font {
    /// A screen's own name, set once at the top of it. Distinct from
    /// ``popsTitle``, which names a thing *on* a screen: without the two being
    /// different sizes a screen title and the first card under it read as
    /// siblings, and nothing tells the reader which is the subject.
    public static let popsLargeTitle = Font.system(.largeTitle, weight: .bold)

    /// The one figure a screen is about — a receipt's total, an account
    /// balance. Rounded because a large amount set in the text face reads as a
    /// heading rather than as a number, and monospaced digits because a figure
    /// that shifts as it changes is one the eye re-reads.
    public static let popsAmount = Font.system(.largeTitle, design: .rounded, weight: .semibold)
        .monospacedDigit()

    /// Screen and section titles.
    public static let popsTitle = Font.system(.title2, weight: .semibold)

    /// The lead line of a row or card.
    public static let popsHeadline = Font.system(.headline)

    /// Running text.
    public static let popsBody = Font.system(.body)

    /// The supporting line under a headline.
    public static let popsSubheadline = Font.system(.subheadline)

    /// The name of a group of rows, set above it. Smaller than the content it
    /// introduces and heavier than it, so a section reads as a label on the
    /// group rather than as the group's first line.
    public static let popsSectionLabel = Font.system(.footnote, weight: .semibold)

    /// Metadata and footnotes.
    public static let popsCaption = Font.system(.caption)

    /// Identifiers, amounts and anything that must align in a column.
    public static let popsMonospaced = Font.system(.body, design: .monospaced)

    /// An opaque identifier a machine chose — a reference, a hash. Monospaced
    /// so it reads as machine text rather than as something a person wrote,
    /// and at caption size so it never competes with the record it points at.
    public static let popsMonospacedCaption = Font.system(.caption, design: .monospaced)
}
