import SwiftUI

/// A small section label over a panel, aligned with the rows inside it.
public struct PopsSectionHeader: View {
    private let title: String
    private let trailing: String?

    /// Creates a section label with an optional trailing count or summary.
    public init(title: String, trailing: String? = nil) {
        self.title = title
        self.trailing = trailing
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: PopsSpacing.sm)
            if let trailing {
                Text(trailing)
                    .font(.popsCaption)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .padding(.horizontal, PopsSpacing.md)
    }
}
