import SwiftUI

extension View {
    /// Applies the list panel's content insets before any selection decoration.
    public func popsPanelInsets() -> some View {
        padding(.horizontal, PopsSpacing.md)
            .padding(.vertical, PopsSpacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Draws the shared surface and border around already-inset content.
    public func popsPanelGround() -> some View {
        background {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .fill(Color.popsSurface)
        }
        .overlay {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        }
    }
}

/// A grounded panel with the standard list content insets.
public struct PopsListPanel<Content: View>: View {
    private let content: Content

    /// Creates a panel around caller-provided rows or other content.
    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content.popsPanelInsets().popsPanelGround()
    }
}

/// Identifiable rows separated by inset rules, without adding a panel surface.
public struct PopsDividedRows<Row: Identifiable, Content: View>: View {
    private let rows: [Row]
    private let leadingInset: CGFloat
    private let content: (Row) -> Content

    /// Creates rows with stable, unique identifiers and an optional divider inset.
    public init(
        rows: [Row], leadingInset: CGFloat = PopsSize.touchTarget + PopsSpacing.md,
        @ViewBuilder content: @escaping (Row) -> Content
    ) {
        self.rows = rows
        self.leadingInset = leadingInset
        self.content = content
    }

    /// The number of separators between a nonnegative count of rows.
    public static func dividerCount(rows: Int) -> Int { rows > 0 ? rows - 1 : 0 }

    public var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.zero) {
            ForEach(rows) { row in
                content(row)
                    .transition(PopsMotion.row)
                if row.id != rows.last?.id {
                    PopsDivider().padding(.leading, leadingInset)
                }
            }
        }
    }
}
