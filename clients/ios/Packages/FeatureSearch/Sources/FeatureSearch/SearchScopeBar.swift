import AppCore
import DesignSystem
import SwiftUI

/// Horizontally scrollable scope chips for the available search pillars.
public struct SearchScopeBar: View {
    @Binding private var scope: SearchScope
    private let available: [SearchPillar]
    private let status: (SearchPillar) -> SearchChipStatus

    /// Creates a scope bar with one chip per available pillar.
    public init(
        scope: Binding<SearchScope>,
        available: [SearchPillar],
        status: @escaping (SearchPillar) -> SearchChipStatus
    ) {
        _scope = scope
        self.available = available
        self.status = status
    }

    public var body: some View {
        ScrollView(.horizontal) {
            PopsGlassGroup(spacing: PopsSpacing.sm) {
                HStack(spacing: PopsSpacing.sm) {
                    SearchScopeChip(
                        title: "All", symbol: nil, tint: SearchScope.all.tint, status: .none,
                        isSelected: scope == .all
                    ) { scope = .all }
                    ForEach(available) { pillar in
                        SearchScopeChip(
                            title: pillar.title, symbol: pillar.symbol, tint: pillar.tint,
                            status: status(pillar), isSelected: scope == .pillar(pillar)
                        ) { scope = .pillar(pillar) }
                    }
                }
            }
        }
        .scrollClipDisabled()
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .popsMotion(value: scope)
    }
}

private struct SearchScopeChip: View {
    let title: String
    let symbol: String?
    let tint: Color
    let status: SearchChipStatus
    let isSelected: Bool
    let action: () -> Void
    @ScaledMetric(relativeTo: .subheadline) private var height =
        PopsSize.touchTarget - PopsSpacing.sm

    private var ink: Color { isSelected ? Color.popsBackground : Color.popsForeground }

    var body: some View {
        Button(action: action) {
            HStack(spacing: PopsSpacing.xs) {
                if let symbol { Image(systemName: symbol).font(.popsSubheadline) }
                Text(title).font(.popsSubheadline.weight(.semibold))
                statusView
            }
            .foregroundStyle(ink)
            .padding(.horizontal, PopsSpacing.md)
            .frame(minHeight: height)
            .background { if isSelected { Capsule().fill(tint) } }
            .popsGlass(in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityValue(status.spoken)
    }

    @ViewBuilder private var statusView: some View {
        switch status {
        case .none:
            EmptyView()
        case .count(let count):
            Text("\(count)").font(.popsCaption).monospacedDigit()
        case .pending:
            Capsule()
                .fill(Color.popsMutedForeground.opacity(0.3))
                .frame(width: PopsSpacing.lg, height: PopsSpacing.sm)
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
    internal var spoken: String {
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
