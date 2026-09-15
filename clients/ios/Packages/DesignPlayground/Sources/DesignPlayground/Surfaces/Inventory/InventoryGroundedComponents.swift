import DesignSystem
import SwiftUI

internal struct InventoryGroundedSectionHeader: View {
    internal let title: String
    internal let status: String?
    internal let destination: InventoryRoute?

    internal init(
        title: String,
        status: String? = nil,
        destination: InventoryRoute? = nil
    ) {
        self.title = title
        self.status = status
        self.destination = destination
    }

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Spacer(minLength: PopsSpacing.sm)
            if let status, let destination {
                NavigationLink(value: destination) {
                    Text(status)
                        .font(.popsSubheadline.weight(.semibold))
                        .frame(minHeight: PopsSize.touchTarget)
                }
            } else if let status {
                Text(status)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
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
                .accessibilityHidden(true)
        }
        .padding(.vertical, PopsSpacing.xs)
        .contentShape(.rect)
    }
}

internal enum InventoryGroundedBrowseProminence: Equatable {
    case wide, compact
}

internal struct InventoryGroundedBrowseTile: View {
    internal let title: String
    internal let count: String
    internal let detail: String
    internal let symbol: String
    internal let destination: InventoryRoute
    internal let prominence: InventoryGroundedBrowseProminence
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        NavigationLink(value: destination) {
            Group {
                if prominence == .wide {
                    HStack(spacing: PopsSpacing.md) {
                        symbolView
                        description
                        Spacer(minLength: PopsSpacing.sm)
                        value
                    }
                } else {
                    VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                        HStack(spacing: PopsSpacing.sm) {
                            symbolView
                            Spacer(minLength: PopsSpacing.xs)
                            value
                        }
                        description
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(PopsSpacing.md)
            .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private var symbolView: some View {
        Image(systemName: symbol)
            .font(.popsHeadline)
            .foregroundStyle(Color.popsAccent)
            .frame(width: markSize, height: markSize)
            .background(Color.popsAccent.opacity(0.14), in: .circle)
    }

    private var description: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(title)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            Text(detail)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(2, reservesSpace: prominence == .compact)
        }
    }

    private var value: some View {
        HStack(spacing: PopsSpacing.sm) {
            Text(count)
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
            Image(systemName: "chevron.forward")
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
        }
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
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
    }
}

internal struct InventoryGroundedSyncStatus: View {
    internal let state: InventorySyncState

    @ViewBuilder internal var body: some View {
        if state != .current {
            InventorySyncCapsule(state: state)
        }
    }
}
