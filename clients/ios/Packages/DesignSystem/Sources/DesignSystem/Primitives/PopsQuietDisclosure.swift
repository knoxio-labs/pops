import SwiftUI

/// A muted section that starts collapsed and reveals content without a caret.
public struct PopsQuietDisclosure<Content: View>: View {
    private let title: String
    private let content: Content
    @State private var isExpanded = false

    /// Creates a section whose expansion lasts for this view's lifetime.
    public init(_ title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.zero) {
            Button {
                isExpanded.toggle()
            } label: {
                HStack {
                    Text(title).font(.popsSectionLabel)
                    Spacer(minLength: PopsSpacing.sm)
                    Text(isExpanded ? "Hide" : "Show").font(.popsCaption)
                }
                .frame(minHeight: PopsSize.touchTarget)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(title)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .accessibilityHint(isExpanded ? "Hide section" : "Show section")
            if isExpanded {
                content
            }
        }
        .foregroundStyle(Color.popsMutedForeground)
    }
}

/// A caret-free secondary row that retains a full-height touch target.
public struct PopsQuietDetailLine: View {
    private let title: String
    private let trailing: String

    /// Creates a muted caption row with trailing date or count text.
    public init(_ title: String, trailing: String) {
        self.title = title
        self.trailing = trailing
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
            Spacer(minLength: PopsSpacing.sm)
            Text(trailing)
        }
        .font(.popsCaption)
        .foregroundStyle(Color.popsMutedForeground)
        .frame(minHeight: PopsSize.touchTarget)
        .contentShape(.rect)
    }
}
