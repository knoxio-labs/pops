import DesignSystem
import SwiftUI

/// The scopes under the search bar: All, then a glass chip per pillar with
/// its tab glyph and, once something is typed, what that pillar has to say:
/// how many it found, a shimmer while it is asking, or why it cannot answer.
/// The row scrolls sideways when the next pillars join and it outgrows the
/// width.
internal struct SearchScopeBar: View {
    @Binding internal var scope: SearchScope
    internal let status: (SearchPillar) -> SearchChipStatus

    internal var body: some View {
        ScrollView(.horizontal) {
            PlaygroundGlassGroup(spacing: PopsSpacing.sm) {
                HStack(spacing: PopsSpacing.sm) {
                    SearchScopeChip(title: "All", symbol: nil, status: .none, isSelected: scope == .all) {
                        scope = .all
                    }
                    ForEach(SearchPillar.allCases) { pillar in
                        SearchScopeChip(
                            title: pillar.title, symbol: pillar.symbol, status: status(pillar),
                            isSelected: scope == .pillar(pillar)
                        ) {
                            scope = .pillar(pillar)
                        }
                    }
                }
            }
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .inventoryMotion(value: scope)
    }
}

private struct SearchScopeChip: View {
    let title: String
    let symbol: String?
    let status: SearchChipStatus
    let isSelected: Bool
    let action: () -> Void
    @ScaledMetric(relativeTo: .subheadline) private var height = PopsSize.touchTarget - PopsSpacing.sm

    private var ink: Color { isSelected ? Color.popsBackground : Color.popsForeground }

    var body: some View {
        Button(action: action) {
            HStack(spacing: PopsSpacing.xs) {
                if let symbol {
                    Image(systemName: symbol)
                        .font(.popsSubheadline)
                }
                Text(title)
                    .font(.popsSubheadline.weight(.semibold))
                SearchChipStatusView(status: status, isSelected: isSelected)
            }
            .foregroundStyle(ink)
            .padding(.horizontal, PopsSpacing.md)
            .frame(minHeight: height)
            .background {
                if isSelected { Capsule().fill(Color.popsAccent) }
            }
            .playgroundGlass(in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityValue(status.spoken)
    }
}

private struct SearchChipStatusView: View {
    let status: SearchChipStatus
    let isSelected: Bool
    @ScaledMetric(relativeTo: .caption) private var pendingWidth = PopsSpacing.lg

    var body: some View {
        switch status {
        case .none:
            EmptyView()
        case .count(let count):
            Text("\(count)")
                .font(.popsCaption)
                .monospacedDigit()
                .opacity(0.7)
                .contentTransition(.numericText(value: Double(count)))
        case .pending:
            Capsule()
                .fill(Color.popsMutedForeground.opacity(0.3))
                .frame(width: pendingWidth, height: PopsSpacing.sm)
                .popsShimmer()
        case .failed:
            glyph("exclamationmark.triangle.fill", tone: .popsWarning)
        case .offline:
            glyph("wifi.slash", tone: .popsMutedForeground)
        case .notOnPhone:
            glyph("arrow.down.circle", tone: .popsMutedForeground)
        }
    }

    private func glyph(_ name: String, tone: Color) -> some View {
        Image(systemName: name)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(isSelected ? Color.popsBackground : tone)
    }
}

extension SearchChipStatus {
    /// What VoiceOver reads after the chip's name.
    fileprivate var spoken: String {
        switch self {
        case .none: ""
        case .count(let count): count == 1 ? "1 result" : "\(count) results"
        case .pending: "Searching"
        case .failed: "Didn't answer"
        case .offline: "Offline"
        case .notOnPhone: "Not on this phone"
        }
    }
}
