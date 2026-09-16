import DesignSystem
import SwiftUI

/// The pieces all four variants draw the same way.
///
/// Shared so the comparison is about the arrangement of properties rather than
/// about which variant got a nicer row. Anything a variant draws differently
/// on purpose lives in that variant's own file.

/// The object being looked at, above whatever the variant makes of it.
internal struct InventoryThingHeader: View {
    internal let thing: InventoryThing
    @ScaledMetric(relativeTo: .largeTitle) private var markSize = 56

    internal var body: some View {
        HStack(spacing: PopsSpacing.lg) {
            Image(systemName: thing.symbol)
                .font(.popsTitle)
                .foregroundStyle(Color.popsAccent)
                .frame(width: markSize, height: markSize)
                .background(Color.popsAccent.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(thing.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                Text(thing.location)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}

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

/// A capability said in words rather than in a field.
internal struct InventoryPropertyChip: View {
    internal let text: String
    internal let tone: Color

    internal init(_ text: String, tone: Color = .popsMutedForeground) {
        self.text = text
        self.tone = tone
    }

    internal var body: some View {
        Text(text)
            .font(.popsSubheadline)
            .foregroundStyle(tone)
            .padding(.horizontal, PopsSpacing.md)
            .padding(.vertical, PopsSpacing.sm)
            .background(tone.opacity(0.12), in: Capsule())
    }
}

/// Something inference proposed, with how sure it is and the three things
/// anybody can do about it.
///
/// Accept, edit and dismiss are all shown rather than hidden behind a swipe,
/// because the question the reviewer is answering includes whether accepting
/// four of these is quick enough to be worth offering at all.
internal struct InventorySuggestionLine: View {
    internal let property: InventoryProperty

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryPropertyLine(key: property.key, value: property.value.display)
            HStack(spacing: PopsSpacing.sm) {
                Text(confidence)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                Spacer(minLength: PopsSpacing.sm)
                action("Dismiss", symbol: "xmark")
                action("Edit", symbol: "pencil")
                action("Accept", symbol: "checkmark")
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private var confidence: String {
        guard case .suggested(let level) = property.origin else { return "" }
        return level.label
    }

    private func action(_ title: String, symbol: String) -> some View {
        Button {
        } label: {
            Label(title, systemImage: symbol)
                .labelStyle(.iconOnly)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.popsAccent)
        .accessibilityLabel("\(title) \(property.key)")
    }
}

/// A problem with what somebody is entering, said where they are entering it.
internal struct InventoryPropertyProblem: View {
    internal let message: String
    internal let resolution: String
    internal let tone: Color

    internal init(message: String, resolution: String, tone: Color = .popsWarning) {
        self.message = message
        self.resolution = resolution
        self.tone = tone
    }

    internal var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(tone)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(message)
                    .font(.popsSubheadline.weight(.semibold))
                    .foregroundStyle(Color.popsForeground)
                Text(resolution)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}
