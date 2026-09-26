import DesignSystem
import SwiftUI

/// One way into an `InventoryChoiceStep`: its name, its glyph, and what
/// choosing it does.
internal struct InventoryChoiceOption {
    internal let title: String
    internal let symbol: InventorySymbol
    internal let action: () -> Void
}

/// A short sheet's ways in, side by side under its title, with Cancel.
internal struct InventoryChoiceStep: View {
    /// The sheet height that fits the options and nothing else.
    internal static let sheetHeight: CGFloat = 220

    internal let title: String
    internal let options: [InventoryChoiceOption]
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            ForEach(options, id: \.title, content: option)
        }
        .padding(.horizontal, PopsSpacing.lg)
        .frame(maxHeight: .infinity, alignment: .top)
        .navigationTitle(title)
        .popsTitleDisplay(large: false)
        .inventoryLeadingBarItem {
            Button("Cancel") { dismiss() }
        }
    }

    private func option(_ option: InventoryChoiceOption) -> some View {
        Button(action: option.action) {
            VStack(spacing: PopsSpacing.sm) {
                option.symbol.image
                    .font(.popsTitle)
                Text(option.title)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, PopsSpacing.lg)
        }
        .inventoryGlassButton()
    }
}
