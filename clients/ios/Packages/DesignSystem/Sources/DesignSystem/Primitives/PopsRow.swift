import SwiftUI

/// A single line of content: a headline, an optional supporting line, and
/// optional trailing content. It draws no background of its own so it composes
/// inside a `PopsCard`, a `List`, or straight onto `popsBackground`.
public struct PopsRow<Trailing: View>: View {
    private let title: String
    private let subtitle: String?
    private let trailing: Trailing

    public init(title: String, subtitle: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing()
    }

    public var body: some View {
        HStack(spacing: PopsSpacing.md) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(title)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                if let subtitle {
                    Text(subtitle)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            Spacer(minLength: PopsSpacing.sm)
            trailing
        }
        .padding(.vertical, PopsSpacing.sm)
    }
}

extension PopsRow where Trailing == EmptyView {
    public init(title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle) { EmptyView() }
    }
}

#Preview("Row") {
    ColorSchemePreview {
        VStack(spacing: PopsSpacing.zero) {
            PopsRow(title: "Coffee", subtitle: "Yesterday")
            PopsRow(title: "Rent", subtitle: "1 August") {
                Text("−$1,240.00")
                    .font(.popsMonospaced)
                    .foregroundStyle(Color.popsDestructive)
            }
        }
    }
}
