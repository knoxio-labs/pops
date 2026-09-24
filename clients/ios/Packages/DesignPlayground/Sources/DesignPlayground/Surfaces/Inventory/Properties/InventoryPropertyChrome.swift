import DesignSystem
import SwiftUI

/// Mirrors `FeatureInventory.InventoryValueTruncation`: this package cannot
/// depend on that one (`Package.swift` links every `Feature*` package the
/// item detail page's real chrome is staged from except `FeatureInventory`,
/// which is not among them yet), so the review surface for a large value
/// carries its own copy of the same rule rather than none at all.
internal enum InventoryValueTruncation {
    internal static let previewLineLimit = 3
    internal static let longValueThreshold = 240

    internal static func isLong(_ value: String) -> Bool {
        value.count > longValueThreshold
    }
}

/// One fact: what it is called, and what it says.
///
/// The value is trailing and the key leading, which is the arrangement a
/// reader scans down a column of values in. A key long enough to wrap takes
/// the value with it rather than squeezing it. A value past
/// ``InventoryValueTruncation/longValueThreshold`` collapses behind a
/// disclosure rather than lengthening the page, the same rule Item detail's
/// real page enforces.
internal struct InventoryPropertyLine: View {
    internal let key: String
    internal let value: String
    internal let footnote: String?
    internal let tone: Color

    @State private var isExpanded = false

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

    private var isLong: Bool { InventoryValueTruncation.isLong(value) }

    private var valueText: some View {
        VStack(alignment: .trailing, spacing: PopsSpacing.xs) {
            Text(value)
                .font(.popsBody.weight(.medium))
                .foregroundStyle(tone)
                .lineLimit(isExpanded || !isLong ? nil : InventoryValueTruncation.previewLineLimit)
            if isLong {
                Button(isExpanded ? "Show less" : "Show more") {
                    isExpanded.toggle()
                }
                .font(.popsCaption)
                .buttonStyle(.borderless)
            }
        }
    }
}
