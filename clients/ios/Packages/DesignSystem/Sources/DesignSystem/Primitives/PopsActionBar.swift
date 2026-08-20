import SwiftUI

/// The actions a screen ends in, held in a bar under its content.
///
/// Meant to be attached with `.safeAreaInset(edge: .bottom)` rather than
/// placed in the stack: the content then scrolls *under* it and the primary
/// action stays reachable, which is the difference between a button somebody
/// has to find and one that is simply there. A screen whose actions scroll
/// away is a screen that loses them at exactly the text sizes where the
/// content is longest.
///
/// The background is a system material, not a token. That is deliberate and it
/// is the one place in this package where a colour comes from somewhere else:
/// a material is what makes content visibly pass *behind* the bar, which a
/// flat fill in `popsBackground` cannot do — it would read as the screen
/// ending there. The hairline above it is a token, because that is a rule
/// rather than a surface.
public struct PopsActionBar<Content: View>: View {
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        VStack(spacing: PopsSpacing.sm) {
            content
        }
        .padding(PopsSpacing.lg)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial)
        .overlay(alignment: .top) { PopsDivider() }
    }
}

#Preview("Action bar") {
    ColorSchemePreview {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                ForEach(0..<12, id: \.self) { index in
                    PopsRow(title: "Row \(index)", subtitle: "Something under it")
                }
            }
            .padding(PopsSpacing.lg)
        }
        .safeAreaInset(edge: .bottom) {
            PopsActionBar {
                PopsButton("Photograph a receipt", prominence: .prominent) {}
            }
        }
    }
}
