import SwiftUI

/// A tall tinted action with a dashed outline for an otherwise empty screen.
public struct PopsDashedActionButton: View {
    private let title: String
    private let symbol: String
    private let tint: Color
    private let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var height = PopsSize.touchTarget * 3

    /// Creates an empty-state action using an SF Symbol and feature accent.
    public init(title: String, symbol: String, tint: Color, action: @escaping () -> Void) {
        self.title = title
        self.symbol = symbol
        self.tint = tint
        self.action = action
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
    }

    public var body: some View {
        Button(action: action) {
            VStack(spacing: PopsSpacing.sm) {
                Image(systemName: symbol)
                    .font(.popsTitle)
                Text(title)
                    .font(.popsHeadline)
            }
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(tint.opacity(0.08), in: shape)
            .overlay {
                shape.strokeBorder(
                    tint,
                    style: StrokeStyle(
                        lineWidth: PopsBorder.emphasis, dash: [PopsSpacing.sm, PopsSpacing.xs]))
            }
            .contentShape(shape)
        }
        .buttonStyle(.plain)
    }
}
