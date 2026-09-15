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
        .padding(.vertical, PopsSpacing.sm)
        .contentShape(.rect)
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
