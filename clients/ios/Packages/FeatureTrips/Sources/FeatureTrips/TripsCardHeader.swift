import DesignSystem
import SwiftUI

internal struct TripsCardHeader<Content: View>: View {
    internal let symbol: String
    internal var decorated = true
    internal var showsDisclosure = true
    @ViewBuilder internal var content: Content
    @Environment(\.dynamicTypeSize) private var typeSize

    internal var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    TripsCardDecoration(
                        symbol: symbol, decorated: decorated, showsDisclosure: showsDisclosure)
                    content.frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                HStack(alignment: .top, spacing: PopsSpacing.md) {
                    TripsCardSymbol(symbol: symbol, decorated: decorated)
                    content
                    Spacer(minLength: PopsSpacing.zero)
                    if showsDisclosure { chevron }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

internal struct TripsCardDecoration: View {
    internal let symbol: String
    internal var decorated = true
    internal var showsDisclosure = true

    internal var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            TripsCardSymbol(symbol: symbol, decorated: decorated)
            Spacer(minLength: PopsSpacing.zero)
            if showsDisclosure { chevron }
        }
        .accessibilityHidden(true)
    }
}

private struct TripsCardSymbol: View {
    let symbol: String
    let decorated: Bool

    var body: some View {
        Image(systemName: symbol)
            .font(decorated ? .popsTitle : .popsHeadline)
            .foregroundStyle(Color.popsTrips)
            .frame(
                minWidth: decorated ? PopsSize.touchTarget : nil,
                minHeight: decorated ? PopsSize.touchTarget : nil
            )
            .background {
                if decorated {
                    RoundedRectangle(cornerRadius: PopsRadius.control)
                        .fill(Color.popsTripsTint)
                }
            }
            .accessibilityHidden(true)
    }
}

private var chevron: some View {
    Image(systemName: "chevron.right")
        .font(.popsCaption)
        .foregroundStyle(Color.popsMutedForeground)
        .accessibilityHidden(true)
}

internal struct TripsSourceHeading: View {
    internal let title: String
    internal let symbol: String
    internal var context: String?
    internal var showsDisclosure = true

    internal var body: some View {
        TripsCardHeader(symbol: symbol, showsDisclosure: showsDisclosure) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(title)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                if let context {
                    Text(context)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}
