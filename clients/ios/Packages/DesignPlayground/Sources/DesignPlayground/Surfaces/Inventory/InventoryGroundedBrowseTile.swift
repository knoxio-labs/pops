import DesignSystem
import SwiftUI

internal enum InventoryGroundedBrowseProminence: Equatable {
    case wide, compact
}

internal struct InventoryGroundedBrowseTile: View {
    internal let title: String
    internal let count: String
    internal let symbol: String
    internal let destination: InventoryRoute
    internal let prominence: InventoryGroundedBrowseProminence
    @ScaledMetric(relativeTo: .body) private var markSize = PopsSize.touchTarget

    internal var body: some View {
        NavigationLink(value: destination) {
            Group {
                if prominence == .wide {
                    horizontalContent
                } else {
                    ViewThatFits(in: .horizontal) {
                        horizontalContent
                        VStack(spacing: PopsSpacing.sm) {
                            symbolView
                            VStack(spacing: PopsSpacing.xs) {
                                titleView
                                compactCount
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(PopsSpacing.md)
            .playgroundGlass(in: RoundedRectangle(cornerRadius: PopsRadius.card))
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

    private var titleView: some View {
        Text(title)
            .font(.popsHeadline)
            .foregroundStyle(Color.popsForeground)
    }

    private var compactTitle: some View {
        titleView
            .fixedSize(horizontal: true, vertical: false)
    }

    private var horizontalContent: some View {
        HStack(spacing: PopsSpacing.sm) {
            symbolView
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                compactTitle
                compactCount
            }
        }
    }

    private var compactCount: some View {
        Text(count)
            .font(.popsCaption.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(Color.popsMutedForeground)
    }
}
