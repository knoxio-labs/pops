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

    /// The scale in ascending order, so a caller can iterate it and a test can
    /// assert it stays ordered.
    public static let scale: [CGFloat] = [zero, xs, sm, md, lg, xl, xxl]
}

/// Corner radii, named by the thing they round rather than by their value.
public enum PopsRadius {
    public static let control: CGFloat = 8
    public static let card: CGFloat = 12
}

/// Stroke widths.
public enum PopsBorder {
    public static let hairline: CGFloat = 1
}
