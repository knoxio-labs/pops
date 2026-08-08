import SwiftUI

/// Renders its content once per colour scheme, stacked. Every `#Preview` in
/// this package goes through it, because a preview written in whichever scheme
/// its author happened to be running is how a dark-mode regression ships.
struct ColorSchemePreview<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            ForEach(ColorScheme.allCases, id: \.self) { scheme in
                content
                    .environment(\.colorScheme, scheme)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.popsBackground.environment(\.colorScheme, scheme))
            }
        }
    }
}
