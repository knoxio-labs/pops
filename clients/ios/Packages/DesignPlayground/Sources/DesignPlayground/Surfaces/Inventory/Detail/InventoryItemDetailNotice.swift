import DesignSystem
import SwiftUI

/// One line saying what is wrong, led by its glyph, with room at the end for
/// the one thing a person can do about it.
///
/// A line rather than ``PopsStatusHeader``'s heading and sentence: on a page
/// about an item, a local-state problem is a footnote to the item, and a
/// paragraph there outweighs the fields it sits between.
internal struct InventoryItemDetailNotice<Action: View>: View {
    private let symbol: String
    private let tint: Color
    private let text: String
    private let action: Action

    internal init(
        symbol: String, tint: Color, text: String, @ViewBuilder action: () -> Action
    ) {
        self.symbol = symbol
        self.tint = tint
        self.text = text
        self.action = action()
    }

    internal init(
        tone: PopsStatusHeader.Tone, text: String, @ViewBuilder action: () -> Action
    ) {
        self.init(symbol: tone.symbolName, tint: tone.color, text: text, action: action)
    }

    internal var body: some View {
        HStack(spacing: PopsSpacing.sm) {
            Image(systemName: symbol)
                .font(.popsSubheadline)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(text)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(1)
            Spacer(minLength: PopsSpacing.sm)
            action
        }
        .inventoryFadeIn()
    }
}

extension InventoryItemDetailNotice where Action == EmptyView {
    internal init(symbol: String, tint: Color, text: String) {
        self.init(symbol: symbol, tint: tint, text: text) { EmptyView() }
    }
}

internal struct InventoryItemDetailRetryButton: View {
    internal var body: some View {
        Button {
        } label: {
            Image(systemName: "arrow.clockwise")
                .font(.popsSubheadline.weight(.semibold))
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                .contentShape(.rect)
        }
        .buttonStyle(.borderless)
        .tint(.popsInventory)
        .accessibilityLabel("Retry")
    }
}
