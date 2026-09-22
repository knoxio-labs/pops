import SwiftUI

/// Rows before they arrive.
public struct PopsListSkeleton: View {
    private let rows: Int

    /// Creates placeholder rows; negative counts render no rows.
    public init(rows: Int) { self.rows = max(rows, 0) }
    @ScaledMetric(relativeTo: .body) private var rowHeight = PopsSize.touchTarget

    public var body: some View {
        VStack(spacing: PopsSpacing.sm) {
            ForEach(0..<rows, id: \.self) { _ in
                RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                    .fill(Color.popsSurface)
                    .frame(height: rowHeight)
            }
        }
        .popsShimmer()
        .accessibilityLabel("Loading")
    }
}
