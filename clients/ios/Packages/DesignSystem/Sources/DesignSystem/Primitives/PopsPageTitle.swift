import SwiftUI

/// A browser's large title drawn in its scroll view, with room for a control
/// beside it.
///
/// The bar's large-title slot clips anything taller than the title's text, so
/// a page that wants a control on the title's row draws the row itself and
/// pairs it with `popsCollapsingTitle(_:)`.
public struct PopsPageTitle<Trailing: View>: View {
    private let title: String
    private let trailing: () -> Trailing

    /// Draws the title alongside caller-provided trailing content.
    public init(title: String, @ViewBuilder trailing: @escaping () -> Trailing) {
        self.title = title
        self.trailing = trailing
    }

    public var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Text(title)
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: PopsSpacing.sm)
            trailing()
        }
    }
}

extension PopsPageTitle where Trailing == EmptyView {
    /// Creates a title without a trailing control.
    public init(title: String) {
        self.init(title: title) { EmptyView() }
    }
}

extension View {
    /// The inline title for a page that draws its own large one: hidden until
    /// the drawn title has scrolled under the bar, as a large title collapses.
    public func popsCollapsingTitle(_ title: String) -> some View {
        modifier(PopsCollapsingTitle(title: title))
    }
}

private struct PopsCollapsingTitle: ViewModifier {
    let title: String
    @State private var scrolledAway = false

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentOffset.y + geometry.contentInsets.top > PopsSpacing.xxl
            } action: { _, isAway in
                scrolledAway = isAway
            }
            .navigationTitle(title)
            .popsTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(title)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                        .opacity(scrolledAway ? 1 : 0)
                        .popsMotion(value: scrolledAway)
                        .accessibilityHidden(!scrolledAway)
                }
            }
    }
}
