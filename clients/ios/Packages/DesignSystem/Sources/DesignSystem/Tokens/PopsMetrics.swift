import CoreGraphics

/// Spacing scale. The steps are the only gaps a layout may use; a value between
/// two of them is a request to change the scale, not to inline a number.
public enum PopsSpacing {
    /// A deliberate absence of a gap — flush rows, edge-to-edge stacks.
    public static let zero: CGFloat = 0
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 12
    public static let lg: CGFloat = 16
    public static let xl: CGFloat = 24
    public static let xxl: CGFloat = 32
}

/// Corner radii, named by the thing they round rather than by their value.
public enum PopsRadius {
    public static let control: CGFloat = 8
    public static let card: CGFloat = 12
}

/// Stroke widths.
public enum PopsBorder {
    public static let hairline: CGFloat = 1

    /// A rule that is saying something — the field the keyboard is pointed at,
    /// the one holding a problem. Thick enough to be seen without colour,
    /// because a state carried only by a hue is a state a reader who cannot
    /// separate those hues does not have.
    public static let emphasis: CGFloat = 2
}

/// Fixed dimensions, named by what occupies them.
///
/// Separate from ``PopsSpacing`` because these are not gaps and do not belong
/// on its scale: a gap between two things and the size of one of them answer
/// to different questions, and putting a 44 on the spacing scale would invite
/// it to be used as padding.
///
/// Each is a *base* size at the default text size. A view that draws one is
/// expected to run it through `@ScaledMetric` so it grows with Dynamic Type —
/// a fixed frame around scaling text is the clipping this package exists to
/// prevent, arrived at from the other side.
public enum PopsSize {
    /// The smallest square a fingertip reliably hits, from Apple's own
    /// guidance. A control smaller than this is one that gets missed rather
    /// than one that looks tidy.
    public static let touchTarget: CGFloat = 44

    /// The column an amount is set in, beside the description it belongs to.
    /// Wide enough for a figure with a currency's worth of minor units and no
    /// wider: an amount column given half the row is one the eye stops
    /// treating as a column.
    public static let amountColumn: CGFloat = 112

    /// A field holding a small count — a quantity, a page number. Narrow on
    /// purpose: a count in a field the width of a description is one a reader
    /// starts reading as a description.
    public static let countField: CGFloat = 72

    /// One captured page, shown beside what was read off it. Taller than it is
    /// wide because a till receipt is, and a plate in a photograph's
    /// proportions makes the thing in it unrecognisable.
    public static let pageWidth: CGFloat = 116

    /// See ``pageWidth``.
    public static let pageHeight: CGFloat = 168
}
