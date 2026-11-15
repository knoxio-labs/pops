import SwiftUI

/// The shared card hierarchy; featured cards give a destination more generous shape and no outline.
public enum PopsCardAppearance: Equatable, Sendable {
    /// The compact, outlined surface used by existing cards.
    case standard
    /// A spacious destination or overview surface whose grouping comes from its background.
    case featured
}

/// A raised container that owns surface, padding and shape and aligns with adjacent cards.
public struct PopsCard<Content: View>: View {
    private let content: Content
    private let appearance: PopsCardAppearance

    /// Creates a card; omitting appearance preserves the compact outlined presentation.
    public init(
        appearance: PopsCardAppearance = .standard,
        @ViewBuilder content: () -> Content
    ) {
        self.appearance = appearance
        self.content = content()
    }

    public var body: some View {
        content
            .padding(PopsSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.popsSurface, in: shape)
            .overlay {
                if appearance == .standard {
                    shape.stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
                }
            }
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(
            cornerRadius: appearance == .featured ? PopsRadius.featuredCard : PopsRadius.card)
    }
}

#Preview("Cards") {
    ColorSchemePreview {
        VStack(spacing: PopsSpacing.lg) {
            PopsCard { PopsRow(title: "August", subtitle: "A recorded month") }
            PopsCard(appearance: .featured) {
                PopsRow(title: "Olinda", subtitle: "A recorded visit")
            }
        }
    }
}
