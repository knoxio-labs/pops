import SwiftUI

/// A raised container. It owns the surface colour, the padding and the corner
/// radius so no screen picks its own, and stretches to the available width so
/// a column of cards lines up.
public struct PopsCard<Content: View>: View {
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content
            .padding(PopsSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
    }
}

#Preview("Card") {
    ColorSchemePreview {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text("August")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                PopsRow(title: "Groceries", subtitle: "12 transactions")
            }
        }
    }
}
