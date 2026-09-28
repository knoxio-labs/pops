import SwiftUI

extension View {
    /// Enables the platform container that coordinates grounded swipe actions when available.
    @ViewBuilder
    public func popsGroundedSwipeActionsContainer() -> some View {
        #if compiler(>=6.4)
            if #available(iOS 27.0, macOS 27.0, *) {
                swipeActionsContainer()
            } else {
                self
            }
        #else
            self
        #endif
    }

    /// Adds actions that can be presented with a short swipe or committed with a full swipe.
    @ViewBuilder
    public func popsGroundedSwipeActions<Actions: View>(
        edge: HorizontalEdge,
        onPresentationChanged: @escaping (Bool) -> Void,
        @ViewBuilder actions: () -> Actions
    ) -> some View {
        #if compiler(>=6.4)
            if #available(iOS 27.0, macOS 27.0, *) {
                swipeActions(
                    edge: edge,
                    allowsFullSwipe: true,
                    content: actions,
                    onPresentationChanged: onPresentationChanged
                )
            } else {
                swipeActions(edge: edge, allowsFullSwipe: true, content: actions)
            }
        #else
            swipeActions(edge: edge, allowsFullSwipe: true, content: actions)
        #endif
    }

    /// Grounds an active swipe row above its surrounding surface.
    public func popsGroundedSwipeRow(isActive: Bool) -> some View {
        let shape = RoundedRectangle(
            cornerRadius: PopsRadius.card + PopsSpacing.xs,
            style: .continuous
        )

        return frame(maxWidth: .infinity)
            .background {
                if isActive {
                    ZStack {
                        shape.fill(Color.popsSurface)
                        shape.fill(Color.popsForeground.opacity(0.08))
                    }
                    .transition(.opacity)
                }
            }
            .containerShape(shape)
            .zIndex(isActive ? 1 : 0)
            .animation(.snappy(duration: 0.18), value: isActive)
    }
}
