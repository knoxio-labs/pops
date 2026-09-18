import DesignSystem
import SwiftUI

/// One fact: what it is called, and what it says.
///
/// The value is trailing and the key leading, which is the arrangement a
/// reader scans down a column of values in. A key long enough to wrap takes
/// the value with it rather than squeezing it.
internal struct InventoryPropertyLine: View {
    internal let key: String
    internal let value: String
    internal let footnote: String?
    internal let tone: Color

    internal init(
        key: String,
        value: String,
        footnote: String? = nil,
        tone: Color = .popsForeground
    ) {
        self.key = key
        self.value = value
        self.footnote = footnote
        self.tone = tone
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                    keyText
                    Spacer(minLength: PopsSpacing.md)
                    valueText.multilineTextAlignment(.trailing)
                }
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    keyText
                    valueText
                }
            }
            if let footnote {
                Text(footnote)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    private var keyText: some View {
        Text(key)
            .font(.popsBody)
            .foregroundStyle(Color.popsMutedForeground)
    }

    private var valueText: some View {
        Text(value)
            .font(.popsBody.weight(.medium))
            .foregroundStyle(tone)
    }
}
