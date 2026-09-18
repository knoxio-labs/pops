import DesignSystem
import SwiftUI

/// The same glass icon face every verb on the page wears.
internal struct InventoryLocationActionFace: View {
    let symbol: InventorySymbol

    var body: some View {
        symbol.image
            .font(.popsSubheadline.weight(.semibold))
            .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
    }
}

/// The name, the path to it with every step tappable, and the counts.
///
/// The path is one wrapping line of links rather than a row of chips, so a
/// long place name breaks inside itself instead of pushing past the edge.
internal struct InventoryLocationHeader: View {
    let tree: InventoryLocationTree
    let place: InventoryLocationNode
    @Binding var jump: InventoryLocationJump?

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                Image(systemName: place.kind.symbol)
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsInventory)
                    .accessibilityHidden(true)
                Text(place.name)
                    .font(.popsLargeTitle)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
            if !ancestors.isEmpty {
                Text(path)
                    .font(.popsSubheadline)
                    .padding(.vertical, PopsSpacing.xs)
                    .environment(
                        \.openURL,
                        OpenURLAction { url in
                            jump = InventoryLocationJump(id: url.lastPathComponent)
                            return .handled
                        })
            }
            Text(summary)
                .font(.popsCaption)
                .monospacedDigit()
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var ancestors: [InventoryLocationNode] {
        Array(tree.breadcrumbs(for: place.id).dropLast())
    }

    private var summary: String {
        let tally = tree.tally(of: place.id)
        return tally.isEmpty ? place.kind.title : "\(place.kind.title) · \(tally.summary)"
    }

    private var path: AttributedString {
        var result = AttributedString()
        for (index, node) in ancestors.enumerated() {
            if index > 0 {
                var separator = AttributedString(" › ")
                separator.foregroundColor = .popsMutedForeground
                result += separator
            }
            var segment = AttributedString(node.name)
            segment.link = URL(string: "place:///\(node.id)")
            segment.foregroundColor = .popsInventory
            result += segment
        }
        return result
    }
}

/// A move somebody else made to the same place, and the two ways out of it.
internal struct InventoryLocationConflict: View {
    let mine: String
    let theirs: String
    let device: String
    let onResolve: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryLocationNoticeLine(
                symbol: InventorySymbol.attention.system, tint: .popsWarning,
                text: "Moved to \(theirs) on \(device)")
            PlaygroundGlassGroup(spacing: PopsSpacing.sm) {
                HStack(spacing: PopsSpacing.sm) {
                    choice("Keep \(mine)")
                    choice("Keep \(theirs)")
                }
            }
        }
        .transition(.opacity)
    }

    private func choice(_ title: String) -> some View {
        Button(action: onResolve) {
            Text(title)
                .font(.popsSubheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .playgroundGlassButton()
    }
}
