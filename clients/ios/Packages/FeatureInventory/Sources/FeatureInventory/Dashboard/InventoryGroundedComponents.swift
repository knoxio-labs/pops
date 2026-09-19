import DesignSystem
import SwiftUI

extension View {
    @ViewBuilder internal func inventoryGroundedSwipeActionsContainer() -> some View {
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

    @ViewBuilder internal func inventoryGroundedSwipeActions<Actions: View>(
        edge: HorizontalEdge,
        onPresentationChanged: @escaping (Bool) -> Void,
        @ViewBuilder actions: () -> Actions
    ) -> some View {
        #if compiler(>=6.4)
            if #available(iOS 27.0, macOS 27.0, *) {
                swipeActions(
                    edge: edge,
                    allowsFullSwipe: false,
                    content: actions,
                    onPresentationChanged: onPresentationChanged
                )
            } else {
                swipeActions(edge: edge, allowsFullSwipe: false, content: actions)
            }
        #else
            swipeActions(edge: edge, allowsFullSwipe: false, content: actions)
        #endif
    }

    internal func inventoryGroundedSwipeRow(isActive: Bool) -> some View {
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

internal struct InventoryGroundedSectionHeader: View {
    internal let title: String
    internal let status: String?
    internal let destination: InventoryRoute?
    /// A tappable status that keeps the caption's look instead of a link's.
    internal let quiet: Bool

    internal init(
        title: String,
        status: String? = nil,
        destination: InventoryRoute? = nil,
        quiet: Bool = false
    ) {
        self.title = title
        self.status = status
        self.destination = destination
        self.quiet = quiet
    }

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Spacer(minLength: PopsSpacing.sm)
            if let status, let destination, !quiet {
                NavigationLink(value: destination) {
                    Text(status)
                        .font(.popsSubheadline.weight(.semibold))
                        .frame(minHeight: PopsSize.touchTarget)
                }
            } else if let status, let destination {
                NavigationLink(value: destination) {
                    Text(status)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .frame(minHeight: PopsSize.touchTarget)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
            } else if let status {
                Text(status)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .contentTransition(.numericText())
            }
        }
    }
}

internal struct InventoryGroundedRowLabel: View {
    internal let title: String
    internal let detail: String
    internal let symbol: String
    internal let value: String?
    internal let tone: Color
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal init(
        title: String,
        detail: String,
        symbol: String,
        value: String? = nil,
        tone: Color = .popsMutedForeground
    ) {
        self.title = title
        self.detail = detail
        self.symbol = symbol
        self.value = value
        self.tone = tone
    }

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: symbol)
                .font(.popsHeadline)
                .foregroundStyle(tone)
                .frame(width: markSize, height: markSize)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(title)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            if let value {
                Text(value)
                    .font(.popsHeadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
            }
            Image(systemName: "chevron.forward")
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .padding(.trailing, PopsSpacing.sm)
                .accessibilityHidden(true)
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
    }
}

internal struct InventoryGroundedListPanel<Content: View>: View {
    private let content: Content

    internal init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    internal var body: some View {
        content
            .padding(.horizontal, PopsSpacing.md)
            .padding(.vertical, PopsSpacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .fill(Color.popsSurface)
            }
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            }
    }
}

internal struct InventoryGroundedOpenPanel<Content: View>: View {
    private let content: Content

    internal init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    internal var body: some View {
        content
            .padding(PopsSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .fill(Color.popsSurface)
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsWarning, lineWidth: PopsBorder.hairline)
            }
    }
}
