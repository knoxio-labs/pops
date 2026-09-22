import SwiftUI

/// One line saying what is wrong, led by its glyph, with room at the end for
/// the one thing a person can do about it. A line rather than a heading and a
/// paragraph: on a page about an item, a local-state problem is a footnote.
public struct PopsNotice<Action: View>: View {
    private let symbol: String
    private let tint: Color
    private let text: String
    private let action: Action

    /// Creates a notice with a custom symbol, tint and trailing action.
    public init(
        symbol: String, tint: Color, text: String, @ViewBuilder action: () -> Action
    ) {
        self.symbol = symbol
        self.tint = tint
        self.text = text
        self.action = action()
    }

    /// Creates a notice using a shared status tone.
    public init(
        tone: PopsStatusHeader.Tone, text: String, @ViewBuilder action: () -> Action
    ) {
        self.init(symbol: tone.symbolName, tint: tone.color, text: text, action: action)
    }

    public var body: some View {
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
        .popsFadeIn()
    }
}

extension PopsNotice where Action == EmptyView {
    /// Creates a notice without a trailing action.
    public init(symbol: String, tint: Color, text: String) {
        self.init(symbol: symbol, tint: tint, text: text) { EmptyView() }
    }
}
